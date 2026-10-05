import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { COMMAND_GROUPS } from "../src/commands";
import { completionSpec, valueKinds } from "../src/completion/spec";
import { GLOBAL_FLAGS } from "../src/help";
import { AGENT, type Sandbox, createSandbox, writeSkill } from "./harness";

/** Bash is on every Unix runner; the scripts are not for Windows shells. */
const hasBash = process.platform !== "win32" && spawnSync("bash", ["--version"]).status === 0;
const HOSTILE = "$(touch pwned)";

describe("completion", () => {
  let box: Sandbox;
  beforeEach(() => {
    box = createSandbox();
  });
  afterEach(() => box.cleanup());

  it("prints a script without opening or creating a library", async () => {
    const bash = await box.cli("completion", "bash");
    expect(bash.code).toBe(0);
    expect(bash.stdout).toContain("complete -F _loadout loadout");
    const zsh = await box.cli("completion", "zsh");
    expect(zsh.stdout).toContain("compdef _loadout loadout");
    const words = await box.cli("completion", "words", "skills");
    expect(words).toMatchObject({ code: 0, stdout: "\n" });
    // Only the agent folder the sandbox made: no library appeared.
    expect(readdirSync(box.home)).toEqual([".claude"]);
  });

  it("lists names from the library, and stays quiet about a missing one", async () => {
    await box.cli("skills", "install", writeSkill(box.root, "pdf"));
    await box.cli("skills", "install", writeSkill(box.root, "docx"));
    await box.cli("skills", "tag", "pdf", "--add", "files");
    expect((await box.cli("completion", "words", "skills")).stdout).toBe("docx\npdf\n");
    expect((await box.cli("completion", "words", "tags")).stdout).toBe("files\n");
    expect((await box.cli("completion", "words", "agents")).stdout).toContain(`${AGENT}\n`);
    const elsewhere = await box.cli("completion", "words", "skills", "--library", box.root);
    expect(elsewhere).toMatchObject({ code: 0, stdout: "\n" });
    expect((await box.cli("completion", "words", "nope")).code).toBe(2);
  });

  it("keeps plumbing out of help", async () => {
    const help = await box.cli("completion", "--help");
    expect(help.stdout).toContain("bash");
    expect(help.stdout).not.toContain("words");
  });

  it.runIf(hasBash)("completes in Bash, quoting names and never running them", async () => {
    const script = join(box.root, "completion.bash");
    writeFileSync(script, (await box.cli("completion", "bash")).stdout);
    // A stand-in `loadout` on PATH that answers the word requests.
    const bin = join(box.root, "bin");
    mkdirSync(bin);
    const fake = join(bin, "loadout");
    writeFileSync(fake, `#!/bin/sh\nprintf '%s\\n' 'my pdf' '${HOSTILE}' docs\n`);
    chmodSync(fake, 0o755);
    const complete = (...words: string[]): string[] => {
      const run = spawnSync(
        "bash",
        [
          "-c",
          `source "$1"; shift; COMP_WORDS=("$@"); COMP_CWORD=$(($# - 1)); _loadout; printf '%s\\n' "\${COMPREPLY[@]}"`,
          "complete",
          script,
          ...words,
        ],
        {
          cwd: box.root,
          encoding: "utf8",
          env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
        },
      );
      return run.stdout.split("\n").filter(Boolean);
    };
    expect(complete("loadout", "sk")).toEqual(["skills"]);
    expect(complete("loadout", "skills", "dep")).toEqual(["deploy"]);
    expect(complete("loadout", "skills", "show", "")).toEqual([
      String.raw`my\ pdf`,
      String.raw`\$\(touch\ pwned\)`,
      "docs",
    ]);
    expect(complete("loadout", "skills", "list", "--source", "g")).toEqual(["git"]);
    expect(complete("loadout", "--library", "x", "skills", "sh")).toEqual(["show"]);
    expect(complete("loadout", "skills", "deploy", "docs", "--ag")).toEqual(["--agent"]);
    expect(existsSync(join(box.root, "pwned"))).toBe(false);
  });
});

const spec = completionSpec(COMMAND_GROUPS, GLOBAL_FLAGS);

/** What the spec read from a command's usage line. */
const positionalsOf = (path: string) => {
  const command = spec.byPath.get(path);
  return command && { positionals: command.positionals, repeats: command.repeats };
};

describe("completion spec", () => {
  it("reads positionals from usage lines", () => {
    // `presets add <name> <ref>…`
    expect(positionalsOf("presets add")).toEqual({
      positionals: ["presets", "skills"],
      repeats: true,
    });
    // `skills undeploy <ref>… --agent <key>…`
    expect(positionalsOf("skills undeploy")).toEqual({ positionals: ["skills"], repeats: true });
    // `repo show`, no arguments
    expect(positionalsOf("repo show")).toEqual({ positionals: [], repeats: false });
  });

  it("knows what each command's options take, even when two commands share a spelling", () => {
    const kinds = valueKinds(spec);
    expect(kinds.get("skills deploy --agent")?.kind).toBe("agents");
    expect(kinds.get("skills list --source")?.choices).toContain("git");
    expect(kinds.get("project init --source")?.choices).toBeUndefined();
    expect(kinds.get(" --library")?.kind).toBe("files");
  });
});
