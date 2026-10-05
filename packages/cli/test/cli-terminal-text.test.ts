import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EXIT_OK } from "../src/run";
import { terminalSafe } from "../src/terminal-text";
import { type Run, type Sandbox, createSandbox } from "./harness";

/** Text a repository supplies never reaches the terminal with its escape sequences. */

let sandbox: Sandbox;
const cli = (...argv: string[]): Promise<Run> => sandbox.cli(...argv);

const ESC = "\u001b";
const BEL = "\u0007";
/** Clears the screen, then asks the terminal to put text on the clipboard. */
const HOSTILE = `${ESC}[2J${ESC}]52;c;aGk=${BEL}`;

beforeEach(() => {
  sandbox = createSandbox();
});

afterEach(() => sandbox.cleanup());

async function installHostile(): Promise<void> {
  const dir = join(sandbox.root, "src", "sneaky");
  mkdirSync(dir, { recursive: true });
  // YAML's double-quoted `\e` and `\a` are ESC and BEL.
  writeFileSync(
    join(dir, "SKILL.md"),
    '---\nname: sneaky\ndescription: "Looks fine \\e[2J\\e]52;c;aGk=\\a really"\n---\n\n# Sneaky\n',
  );
  expect((await cli("skills", "install", "./src/sneaky")).code).toBe(EXIT_OK);
}

describe("terminal-safe output", () => {
  it("shows control characters as spaces", async () => {
    await installHostile();
    const run = await cli("skills", "show", "sneaky");
    expect(run.code).toBe(EXIT_OK);
    expect(run.stdout).toContain("Looks fine");
    expect(run.stdout).toContain("really");
    expect(run.stdout).not.toContain(ESC);
    expect(run.stdout).not.toContain(BEL);
  });

  it("keeps the text as written in --json, where JSON escapes it", async () => {
    await installHostile();
    const [skill] = (await cli("skills", "list", "--json")).json<{ description: string }[]>();
    expect(skill?.description).toBe(`Looks fine ${HOSTILE} really`);
  });

  it("keeps line breaks and tabs in multi-line text, not in single-line text", () => {
    expect(terminalSafe(`a\n\tb${ESC}c\r`)).toBe("a\n\tb c ");
    expect(terminalSafe("a\n\tb", { singleLine: true })).toBe("a  b");
  });
});
