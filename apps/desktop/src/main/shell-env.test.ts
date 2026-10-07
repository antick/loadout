import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { coreEnv, pickShellEnv, readShellEnv } from "./shell-env";

/** The stand-in shells are `#!/bin/sh` scripts; Windows has no login shell to ask anyway. */
const NO_POSIX_SHELL = process.platform === "win32";

describe("shell environment", () => {
  let dir: string | null = null;
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = null;
  });

  /** A stand-in shell that runs `script` whatever it is asked. */
  function fakeShell(script: string): string {
    dir = mkdtempSync(join(tmpdir(), "loadout-shell-"));
    const path = join(dir, "shell");
    writeFileSync(path, `#!/bin/sh\n${script}\n`);
    chmodSync(path, 0o755);
    return path;
  }

  it("lets the process's variables win for core, except the login shell's PATH", () => {
    const shell = { CODEX_HOME: "/from/shell", PATH: "/opt/homebrew/bin:/usr/bin" };
    const env = coreEnv(shell, { CODEX_HOME: "/from/terminal", PATH: "/usr/bin:/bin", HOME: "/h" });
    expect(env).toMatchObject({
      CODEX_HOME: "/from/terminal",
      PATH: "/opt/homebrew/bin:/usr/bin",
      HOME: "/h",
    });
    // Before the shell has been read, the process's own PATH stands.
    expect(coreEnv({}, { PATH: "/usr/bin" }).PATH).toBe("/usr/bin");
  });

  it("keeps only the asked names, after the marker, and skips empty values", () => {
    const output = `welcome banner CODEX_HOME=/nope\n__LOADOUT_SHELL_ENV__${[
      "CODEX_HOME=/Users/me/.codex-work",
      "PATH=/usr/bin",
      "QWEN_HOME=",
      "WEIRD=a=b",
      "",
    ].join("\0")}`;
    expect(pickShellEnv(output, ["CODEX_HOME", "QWEN_HOME", "WEIRD"])).toEqual({
      CODEX_HOME: "/Users/me/.codex-work",
      WEIRD: "a=b",
    });
    expect(pickShellEnv("no marker at all", ["CODEX_HOME"])).toBeNull();
  });

  it.skipIf(NO_POSIX_SHELL)("asks the login shell and reads what it exports", async () => {
    const shell = fakeShell(
      `echo "profile noise"; printf '%s' __LOADOUT_SHELL_ENV__; printf 'CODEX_HOME=/work/codex\\0FLAG=%s\\0' "$LOADOUT_RESOLVING_SHELL_ENV"`,
    );
    expect(await readShellEnv(["CODEX_HOME", "FLAG"], { shell, platform: "darwin" })).toEqual({
      CODEX_HOME: "/work/codex",
      FLAG: "1",
    });
  });

  it("gives nothing on Windows", async () => {
    expect(await readShellEnv(["CODEX_HOME"], { platform: "win32" })).toEqual({});
  });

  it.skipIf(NO_POSIX_SHELL)("gives null for a failing shell or a hung one", async () => {
    const failing = fakeShell("exit 3");
    expect(await readShellEnv(["CODEX_HOME"], { shell: failing, platform: "linux" })).toBeNull();
    // Ignores SIGTERM and waits on stdin, like a stubborn interactive profile.
    const hung = fakeShell("trap '' TERM; read line; sleep 5");
    const started = Date.now();
    expect(
      await readShellEnv(["CODEX_HOME"], { shell: hung, platform: "linux", timeoutMs: 200 }),
    ).toBeNull();
    expect(Date.now() - started).toBeLessThan(2000);
  });
});
