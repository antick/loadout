import { describe, expect, it } from "vitest";
import { isLeftOut } from "../src/util/left-out";

describe("what never leaves this computer", () => {
  it.each([
    [".env", false, true],
    [".env.local", false, true],
    [".ENV.production", false, true],
    [".env.example", false, false],
    [".env.local.sample", false, false],
    ["run.log", false, true],
    ["cache.pyc", false, true],
    [".DS_Store", false, true],
    ["venv", true, true],
    ["node_modules", true, true],
    ["__pycache__", true, true],
    ["venv", false, false],
    ["SKILL.md", false, false],
    ["environment.md", false, false],
  ])("%s (folder: %s) is left out: %s", (name, directory, expected) => {
    expect(isLeftOut(name, directory)).toBe(expected);
  });
});
