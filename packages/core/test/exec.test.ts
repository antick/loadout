import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveProgram } from "../src/util/exec";

describe("resolving a program on Windows", () => {
  let root: string | null = null;
  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it("finds it on PATH only, never in the working folder", () => {
    root = mkdtempSync(join(tmpdir(), "exec-"));
    const bin = join(root, "bin");
    mkdirSync(bin);
    writeFileSync(join(bin, "git.exe"), "");
    writeFileSync(join(bin, "tool.cmd"), "");
    const env = { PATH: ["relative-dir", bin].join(process.platform === "win32" ? ";" : ":") };
    expect(resolveProgram("git", env, "win32")).toBe(join(bin, "git.exe"));
    // A batch file cannot be started without a shell: not picked.
    expect(resolveProgram("tool", env, "win32")).not.toBe(join(bin, "tool.cmd"));
    expect(resolveProgram("missing", env, "win32")).toContain("__missing_not_found__");
    expect(resolveProgram("git", env, "darwin")).toBe("git");
    expect(resolveProgram(join(bin, "git.exe"), env, "win32")).toBe(join(bin, "git.exe"));
  });
});
