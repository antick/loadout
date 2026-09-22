import { mkdirSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import type { PendingRemoval } from "@loadout/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  LIBRARY_LOCATION,
  approvalToken,
  isApproved,
  listRemovedPaths,
  sortRemovals,
} from "../src/updates";
import { tempDir, writeFile } from "./helpers";

let root: string;
let current: string;
let replacement: string;
let cleanup: () => void;

function tree(dir: string, files: Record<string, string>): void {
  mkdirSync(dir, { recursive: true });
  for (const [path, content] of Object.entries(files)) writeFile(join(dir, path), content);
}

beforeEach(() => {
  const temp = tempDir();
  root = temp.dir;
  cleanup = temp.cleanup;
  current = join(root, "current");
  replacement = join(root, "replacement");
});
afterEach(() => cleanup());

describe("listRemovedPaths", () => {
  it("reports nothing when the replacement keeps or adds files", () => {
    tree(current, { "SKILL.md": "a", "scripts/run.sh": "b" });
    tree(replacement, { "SKILL.md": "changed", "scripts/run.sh": "b", "extra/new.md": "c" });
    expect(listRemovedPaths(current, replacement)).toEqual([]);
  });

  it("lists lost files sorted, and a lost folder once with a trailing slash", () => {
    tree(current, {
      "SKILL.md": "a",
      "z-last.md": "z",
      "docs/a.md": "1",
      "docs/deep/b.md": "2",
      "scripts/keep.sh": "k",
      "scripts/gone.sh": "g",
    });
    tree(replacement, { "SKILL.md": "a", "scripts/keep.sh": "k" });
    expect(listRemovedPaths(current, replacement)).toEqual([
      "docs/",
      "scripts/gone.sh",
      "z-last.md",
    ]);
  });

  it("treats a path that changed type as removed", () => {
    tree(current, { "SKILL.md": "a", "data/values.json": "{}", notes: "a file" });
    tree(replacement, { "SKILL.md": "a", data: "now a file", "notes/inner.md": "now a folder" });
    expect(listRemovedPaths(current, replacement)).toEqual(["data/", "notes"]);
  });

  it("ignores caches and OS litter, at any depth", () => {
    tree(current, {
      "SKILL.md": "a",
      ".DS_Store": "x",
      "Thumbs.db": "x",
      ".gitignore": "x",
      "__pycache__/mod.cpython-312.pyc": "x",
      "scripts/mod.pyc": "x",
      "scripts/mod.py": "print()",
    });
    tree(replacement, { "SKILL.md": "a", "scripts/mod.py": "print()" });
    expect(listRemovedPaths(current, replacement)).toEqual([]);
  });

  it("does not count a link in the replacement as a counterpart", () => {
    tree(current, { "SKILL.md": "a", "shared/file.md": "x" });
    tree(replacement, { "SKILL.md": "a" });
    tree(join(root, "elsewhere"), { "file.md": "x" });
    symlinkSync(join(root, "elsewhere"), join(replacement, "shared"), "dir");
    expect(listRemovedPaths(current, replacement)).toEqual(["shared/"]);
  });

  it("has nothing to lose when there is no current tree, and refuses a missing replacement", () => {
    tree(replacement, { "SKILL.md": "a" });
    expect(listRemovedPaths(join(root, "absent"), replacement)).toEqual([]);
    tree(current, { "SKILL.md": "a" });
    expect(() => listRemovedPaths(current, join(root, "absent"))).toThrow(/missing/);
  });
});

describe("approval token", () => {
  const removals: PendingRemoval[] = [
    { location: "claude_code", path: "docs/", kind: "removed" },
    { location: LIBRARY_LOCATION, path: "scripts/gone.sh", kind: "removed" },
    { location: LIBRARY_LOCATION, path: "docs/", kind: "removed" },
  ];

  it("sorts by location, then path", () => {
    expect(sortRemovals(removals)).toEqual([
      { location: "claude_code", path: "docs/", kind: "removed" },
      { location: LIBRARY_LOCATION, path: "docs/", kind: "removed" },
      { location: LIBRARY_LOCATION, path: "scripts/gone.sh", kind: "removed" },
    ]);
  });

  it("is stable across input order and is a sha256 hex string", () => {
    const token = approvalToken("abc123", removals);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(approvalToken("abc123", removals.toReversed())).toBe(token);
  });

  it("changes with the domain, the list, and where a boundary falls", () => {
    const token = approvalToken("abc123", removals);
    expect(approvalToken("def456", removals)).not.toBe(token);
    expect(approvalToken("abc123", removals.slice(1))).not.toBe(token);
    // `a` + `b/c` must not collide with `a/b` + `c`, nor the domain with the first location.
    expect(approvalToken("d", [{ location: "a", path: "b/c", kind: "removed" }])).not.toBe(
      approvalToken("d", [{ location: "a/b", path: "c", kind: "removed" }]),
    );
    expect(approvalToken("da", [{ location: "", path: "x", kind: "removed" }])).not.toBe(
      approvalToken("d", [{ location: "a", path: "x", kind: "removed" }]),
    );
  });

  it("approves an empty list without a token, and a non-empty one only with its own token", () => {
    expect(isApproved(null, "abc123", [])).toBe(true);
    expect(isApproved(null, "abc123", removals)).toBe(false);
    expect(isApproved("nonsense", "abc123", removals)).toBe(false);
    expect(isApproved(approvalToken("abc123", removals), "abc123", removals)).toBe(true);
    expect(isApproved(approvalToken("abc123", removals), "moved", removals)).toBe(false);
  });
});
