import { chmodSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { MARKETPLACE_NAME, type Skill } from "@skillboard/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AppError } from "../src/errors";
import { LIBRARY_LOCATION, MAX_DIFF_TEXT_BYTES, diffTrees } from "../src/updates";
import { makeSkill, writeFile } from "./helpers";
import { commitAll, leftoverCheckouts, writeZip } from "./install-fixtures";
import { MARKET_SOURCE, type UpdatesWorld, createUpdatesWorld } from "./updates-world";

let world: UpdatesWorld;
/** A folder on "this machine" that a local skill was installed from. */
let sourceDir: string;

beforeEach(() => {
  world = createUpdatesWorld();
  sourceDir = makeSkill(join(world.root, "work"), "helper", {
    files: { "scripts/run.sh": "echo one\n", "notes/old.md": "old\n" },
  });
});
afterEach(() => world.restore());

const installLocal = (): Promise<Skill> => world.install.api.fromPath(sourceDir);

async function rejection(promise: Promise<unknown>): Promise<AppError> {
  const error = await promise.then(
    () => null,
    (thrown: unknown) => thrown,
  );
  expect(error).toBeInstanceOf(AppError);
  return error as AppError;
}

describe("check of local sources", () => {
  it("compares the source folder with the library", async () => {
    const skill = await installLocal();
    expect((await world.updates.api.check(skill.id, true)).updateStatus).toBe("up_to_date");

    // Only the line endings differ: not worth offering.
    writeFile(join(sourceDir, "scripts", "run.sh"), "echo one\r\n");
    expect((await world.updates.api.check(skill.id, true)).updateStatus).toBe("up_to_date");

    writeFile(join(sourceDir, "scripts", "run.sh"), "echo two\n");
    expect((await world.updates.api.check(skill.id, true)).updateStatus).toBe("update_available");
    expect(world.lookups()).toBe(0);
  });

  it("reports a vanished source, and a skill that never had one", async () => {
    const skill = await installLocal();
    rmSync(sourceDir, { recursive: true });
    expect(await world.updates.api.check(skill.id, true)).toMatchObject({
      updateStatus: "source_missing",
      lastCheckError: "Original source path no longer exists",
    });
    const plain = world.addSkill("plain");
    expect((await world.updates.api.check(plain.id, true)).updateStatus).toBe("local_only");
  });

  it("looks inside an archive source", async () => {
    const archive = writeZip(join(world.root, "packed.zip"), {
      "packed/SKILL.md": "---\nname: packed\ndescription: zipped\n---\n",
      "packed/data.txt": "v1",
    });
    const skill = await world.install.api.fromPath(archive);
    expect((await world.updates.api.check(skill.id, true)).updateStatus).toBe("up_to_date");
    writeZip(archive, {
      "packed/SKILL.md": "---\nname: packed\ndescription: zipped\n---\n",
      "packed/data.txt": "v2",
    });
    expect((await world.updates.api.check(skill.id, true)).updateStatus).toBe("update_available");

    const result = await world.updates.api.reimport(skill.id);
    expect(result.contentChanged).toBe(true);
    expect(readFileSync(join(skill.libraryPath, "data.txt"), "utf8")).toBe("v2");
  });
});

describe("reimport, relink, detach", () => {
  it("re-imports from the original folder, guarding removals", async () => {
    const skill = await installLocal();
    world.store.setTags(skill.id, ["mine"]);
    writeFile(join(sourceDir, "scripts", "run.sh"), "echo two\n");
    rmSync(join(sourceDir, "notes"), { recursive: true });

    const asked = await world.updates.api.reimport(skill.id);
    expect(asked.pendingRemovals).toEqual([{ location: LIBRARY_LOCATION, path: "notes/" }]);
    expect(readFileSync(join(skill.libraryPath, "scripts", "run.sh"), "utf8")).toBe("echo one\n");
    // A declined re-import leaves the row exactly as it was.
    expect(world.store.get(skill.id)).toEqual({ ...skill, tags: ["mine"] });

    const applied = await world.updates.api.reimport(skill.id, asked.approval);
    expect(applied).toMatchObject({ contentChanged: true, pendingRemovals: [] });
    expect(applied.skill).toMatchObject({
      id: skill.id,
      tags: ["mine"],
      sourceType: "local",
      sourceRef: sourceDir,
      updateStatus: "local_only",
    });
    expect(readFileSync(join(skill.libraryPath, "scripts", "run.sh"), "utf8")).toBe("echo two\n");
    expect(existsSync(join(skill.libraryPath, "notes"))).toBe(false);

    const again = await world.updates.api.reimport(skill.id);
    expect(again.contentChanged).toBe(false);
  });

  it("refuses to re-import without a usable source", async () => {
    const plain = world.addSkill("plain");
    expect((await rejection(world.updates.api.reimport(plain.id))).message).toBe(
      "Local skill is missing its original source path",
    );
    const skill = await installLocal();
    rmSync(sourceDir, { recursive: true });
    expect((await rejection(world.updates.api.reimport(skill.id))).code).toBe("NOT_FOUND");
    expect(world.store.get(skill.id).updateStatus).toBe("source_missing");

    const pdf = await world.installFromGit("pdf");
    expect((await rejection(world.updates.api.reimport(pdf.id))).code).toBe("UNSUPPORTED");
    expect((await rejection(world.updates.api.relink(pdf.id, sourceDir))).code).toBe("UNSUPPORTED");
  });

  it("relinks to a new folder and takes its content", async () => {
    const skill = await installLocal();
    const moved = makeSkill(join(world.root, "elsewhere"), "helper", {
      files: { "scripts/run.sh": "echo moved\n" },
    });

    const asked = await world.updates.api.relink(skill.id, moved);
    expect(asked.pendingRemovals).toEqual([{ location: LIBRARY_LOCATION, path: "notes/" }]);
    expect(world.store.get(skill.id).sourceRef).toBe(sourceDir);
    // The token belongs to that folder: it approves nothing for a plain re-import.
    const reimported = await world.updates.api.reimport(skill.id, asked.approval);
    expect(reimported).toMatchObject({ contentChanged: false, pendingRemovals: [] });

    const applied = await world.updates.api.relink(skill.id, moved, asked.approval);
    expect(applied.skill).toMatchObject({
      id: skill.id,
      sourceType: "local",
      sourceRef: moved,
      updateStatus: "local_only",
    });
    expect(readFileSync(join(skill.libraryPath, "scripts", "run.sh"), "utf8")).toBe("echo moved\n");
  });

  it("only relinks to a real skill folder outside the library", async () => {
    const skill = await installLocal();
    const empty = join(world.root, "empty");
    writeFile(join(empty, "readme.txt"), "no marker");
    expect((await rejection(world.updates.api.relink(skill.id, empty))).code).toBe("INVALID_INPUT");
    expect((await rejection(world.updates.api.relink(skill.id, join(empty, "nope")))).code).toBe(
      "NOT_FOUND",
    );
    expect((await rejection(world.updates.api.relink(skill.id, "relative/path"))).code).toBe(
      "INVALID_INPUT",
    );
    const other = world.addSkill("other");
    expect((await rejection(world.updates.api.relink(skill.id, other.libraryPath))).code).toBe(
      "INVALID_INPUT",
    );
  });

  it("detaches a skill from its source and keeps its content", async () => {
    const pdf = await world.installFromGit("pdf");
    const detached = await world.updates.api.detach(pdf.id);
    expect(detached).toMatchObject({
      id: pdf.id,
      sourceType: "local",
      sourceRef: null,
      sourceUrl: null,
      sourceSubpath: null,
      sourceBranch: null,
      sourceRevision: null,
      remoteRevision: null,
      updateStatus: "local_only",
      contentHash: pdf.contentHash,
    });
    expect(existsSync(join(pdf.libraryPath, "SKILL.md"))).toBe(true);
    expect((await world.updates.api.check(pdf.id, true)).updateStatus).toBe("local_only");
  });
});

describe("source preview", () => {
  it("classifies every kind of difference", () => {
    const before = join(world.root, "before");
    const after = join(world.root, "after");
    const big = "x".repeat(MAX_DIFF_TEXT_BYTES + 1);
    for (const [dir, version] of [
      [before, "1"],
      [after, "2"],
    ] as const) {
      writeFile(join(dir, "same.md"), "same");
      writeFile(join(dir, "text.md"), `text ${version}\n`);
      writeFile(join(dir, "big.txt"), big + version);
      writeFileSync(join(dir, "blob.bin"), Buffer.from([0, 1, 2, Number(version)]));
      writeFileSync(join(dir, "latin1.txt"), Buffer.from([0xe9, 0x20, Number(version) + 0x30]));
      writeFile(join(dir, "build.sh"), "#!/bin/sh\n");
      writeFile(join(dir, ".DS_Store"), version);
    }
    writeFile(join(before, "gone/old.md"), "bye");
    writeFile(join(after, "new/fresh.md"), "hello");
    chmodSync(join(after, "build.sh"), 0o755);

    const entries = diffTrees(before, after);
    const summary = entries.map((entry) => [entry.path, entry.status, entry.kind]);
    const expected = [
      ["big.txt", "modified", "too_large"],
      ["blob.bin", "modified", "binary"],
      ["build.sh", "modified", "permission_only"],
      ["gone/old.md", "removed", "text"],
      ["latin1.txt", "modified", "binary"],
      ["new/fresh.md", "added", "text"],
      ["text.md", "modified", "text"],
    ];
    const posix = process.platform !== "win32";
    expect(summary).toEqual(expected.filter(([, , kind]) => posix || kind !== "permission_only"));

    const byPath = new Map(entries.map((entry) => [entry.path, entry]));
    expect(byPath.get("text.md")).toMatchObject({ before: "text 1\n", after: "text 2\n" });
    expect(byPath.get("gone/old.md")).toMatchObject({ before: "bye", after: null });
    expect(byPath.get("new/fresh.md")).toMatchObject({ before: null, after: "hello" });
    expect(byPath.get("big.txt")).toMatchObject({ before: null, after: null });
    expect(byPath.get("blob.bin")).toMatchObject({ before: null, after: null });
    if (posix) {
      expect(byPath.get("build.sh")).toMatchObject({
        before: null,
        after: null,
        executableBefore: false,
        executableAfter: true,
      });
    }
  });

  it("diffs and shows a local source straight from its folder", async () => {
    const skill = await installLocal();
    writeFile(join(sourceDir, "scripts", "run.sh"), "echo two\n");
    writeFile(join(sourceDir, "SKILL.md"), "---\nname: helper\n---\n\n# Helper v2\n");

    const diff = await world.updates.api.sourceDiff(skill.id);
    expect(diff).toMatchObject({ skillId: skill.id, sourceLabel: "Local", revision: "workspace" });
    expect(diff.entries.map((entry) => entry.path)).toEqual(["SKILL.md", "scripts/run.sh"]);

    const document = await world.updates.api.sourceDocument(skill.id);
    expect(document).toMatchObject({
      filename: "SKILL.md",
      sourceLabel: "Local",
      revision: "workspace",
    });
    expect(document.content).toContain("# Helper v2");
  });

  it("reads git and marketplace sources from a checkout that is always removed", async () => {
    const pdf = await world.installFromGit("pdf");
    const docx = await world.install.api.fromMarket(MARKET_SOURCE, "docx");
    writeFile(join(world.remote, "skills", "pdf", "scripts", "run.sh"), "echo pdf v2\n");
    const next = commitAll(world.remote, "pdf: v2");

    const diff = await world.updates.api.sourceDiff(pdf.id);
    expect(diff).toMatchObject({ sourceLabel: "Git", revision: next });
    expect(diff.entries).toEqual([
      expect.objectContaining({
        path: "scripts/run.sh",
        status: "modified",
        kind: "text",
        before: "echo pdf\n",
        after: "echo pdf v2\n",
      }),
    ]);
    const document = await world.updates.api.sourceDocument(docx.id);
    expect(document).toMatchObject({ sourceLabel: MARKETPLACE_NAME, revision: next });
    expect(document.content).toContain("# docx");
    // Looking never changes the library.
    expect(world.store.get(pdf.id)).toEqual(pdf);
    expect(leftoverCheckouts(world.tmp)).toEqual([]);

    rmSync(join(world.remote, "skills", "pdf"), { recursive: true });
    commitAll(world.remote, "pdf: removed");
    expect((await rejection(world.updates.api.sourceDiff(pdf.id))).code).toBe("NOT_FOUND");
    expect(leftoverCheckouts(world.tmp)).toEqual([]);
  });

  it("explains why a skill without a source has nothing to show", async () => {
    const plain = world.addSkill("plain");
    expect((await rejection(world.updates.api.sourceDiff(plain.id))).message).toBe(
      "Local skill is missing its original source path",
    );
  });
});
