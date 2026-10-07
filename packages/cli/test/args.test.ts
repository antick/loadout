import { describe, expect, it } from "vitest";
import {
  UsageError,
  flagBoolean,
  flagChoice,
  flagInteger,
  flagList,
  flagString,
  parseArgs,
  splitCommandPath,
} from "../src/args";
import { classifySource, selectSkills } from "../src/commands/skills-install";
import { GLOBAL_FLAGS } from "../src/help";
import { table } from "../src/output";

describe("argument parser", () => {
  const specs = [
    { name: "json", type: "boolean", description: "" },
    { name: "agent", short: "a", type: "list", description: "" },
    { name: "message", short: "m", type: "string", description: "" },
    { name: "limit", type: "string", description: "" },
  ] as const;

  it("separates positionals, booleans, values and repeated lists", () => {
    const args = parseArgs(
      ["one", "--json", "-a", "x", "--agent=y", "two", "-m", "hi there"],
      specs,
    );
    expect(args.positionals).toEqual(["one", "two"]);
    expect(flagBoolean(args, "json")).toBe(true);
    expect(flagList(args, "agent")).toEqual(["x", "y"]);
    expect(flagString(args, "message")).toBe("hi there");
    expect(flagList(args, "missing")).toEqual([]);
  });

  it("treats everything after -- as positional and keeps negative numbers", () => {
    const args = parseArgs(["-5", "--", "--json", "-a"], specs);
    expect(args.positionals).toEqual(["-5", "--json", "-a"]);
    expect(flagBoolean(args, "json")).toBe(false);
  });

  it("rejects unknown options, missing values, repeats and values on booleans", () => {
    expect(() => parseArgs(["--nope"], specs)).toThrow(UsageError);
    expect(() => parseArgs(["--message"], specs)).toThrow(/needs a value/);
    expect(() => parseArgs(["--message", "--json"], specs)).toThrow(/needs a value/);
    expect(() => parseArgs(["-m", "a", "-m", "b"], specs)).toThrow(/twice/);
    expect(() => parseArgs(["--json=true"], specs)).toThrow(/does not take a value/);
    expect(parseArgs(["--message=--odd"], specs).flags.message).toBe("--odd");
  });

  it("reads whole numbers only", () => {
    expect(flagInteger(parseArgs(["--limit", "5"], specs), "limit")).toBe(5);
    expect(flagInteger(parseArgs([], specs), "limit")).toBeUndefined();
    expect(() => flagInteger(parseArgs(["--limit", "0"], specs), "limit")).toThrow(UsageError);
    expect(() => flagInteger(parseArgs(["--limit", "x"], specs), "limit")).toThrow(UsageError);
  });

  it("reads a choice, and names the choices when the value is not one", () => {
    const flag = { name: "message", choices: ["a", "b"] as const };
    expect(flagChoice(parseArgs(["--message", "b"], specs), flag)).toBe("b");
    expect(flagChoice(parseArgs([], specs), flag)).toBeUndefined();
    expect(() => flagChoice(parseArgs(["--message", "c"], specs), flag)).toThrow(
      "--message must be one of: a, b.",
    );
  });

  it("finds the command path around global options", () => {
    const split = splitCommandPath(
      ["--library", "/x", "skills", "--json", "list", "--tag", "a"],
      GLOBAL_FLAGS,
      2,
    );
    expect(split.path).toEqual(["skills", "list"]);
    expect(split.rest).toEqual(["--library", "/x", "--json", "--tag", "a"]);
    expect(splitCommandPath(["skills", "--tag", "a", "list"], GLOBAL_FLAGS, 2).path).toEqual([
      "skills",
    ]);
  });

  it("aligns tables and shows a message when empty", () => {
    expect(
      table(
        ["a", "bee"],
        [
          ["1", true],
          ["22", null],
        ],
        "none",
      ),
    ).toBe("A   BEE\n1   yes\n22  -");
    expect(table(["a"], [], "none")).toBe("none");
  });
});

describe("install sources", () => {
  it("classifies by spelling alone", () => {
    expect(classifySource("./folder")).toEqual({ kind: "path", path: "./folder" });
    expect(classifySource("github.com/anthropics/skills")).toEqual({
      kind: "git",
      url: "https://github.com/anthropics/skills",
    });
    expect(classifySource("~/skills/x").kind).toBe("path");
    expect(classifySource("/abs/x").kind).toBe("path");
    expect(classifySource("C:\\skills\\x").kind).toBe("path");
    expect(classifySource("bundle.ZIP").kind).toBe("path");
    expect(classifySource("thing.skill").kind).toBe("path");
    expect(classifySource("https://example.com/a/b").kind).toBe("git");
    expect(classifySource("git@example.com:a/b.git").kind).toBe("git");
    expect(classifySource("owner/repo")).toEqual({ kind: "git", url: "owner/repo" });
    expect(classifySource("owner/repo@my-skill")).toEqual({
      kind: "market",
      source: "owner/repo",
      skillId: "my-skill",
    });
    expect(classifySource("owner/repo/my-skill").kind).toBe("market");
    expect(() => classifySource("just-a-word")).toThrow(UsageError);
  });

  it("hands every Git spelling the app takes to Git, as typed", () => {
    for (const text of [
      "owner/repo#dev",
      "owner/repo#dev@my-skill",
      "github:owner/repo",
      "gitlab:group/sub/repo",
      "owner/repo/skills/my-skill",
      "owner/repo/skills/my-skill@pdf",
      "npx skills add owner/repo --skill pdf",
      "skills add owner/repo",
    ]) {
      expect(classifySource(text)).toEqual({ kind: "git", url: text });
    }
  });

  it("picks repository skills only when the choice is clear", () => {
    const one = {
      relPath: "skills/alpha",
      name: "Alpha",
      description: null,
      manualOnly: false,
      traits: [],
      alreadyInstalled: false,
    };
    const two = {
      relPath: "skills/beta",
      name: "Beta",
      description: null,
      manualOnly: false,
      traits: [],
      alreadyInstalled: false,
    };
    expect(selectSkills([one], [], false)).toEqual([one]);
    expect(() => selectSkills([one, two], [], false)).toThrow(UsageError);
    expect(selectSkills([one, two], [], true)).toEqual([one, two]);
    expect(selectSkills([one, two], ["beta"], false)).toEqual([two]);
    expect(selectSkills([one, two], ["skills/alpha"], false)).toEqual([one]);
    expect(() => selectSkills([one, two], ["gamma"], false)).toThrow(/No skill called/);
    expect(() => selectSkills([], [], true)).toThrow(/No skills/);
    // As in the app: the folder called `beta` wins over a frontmatter name, and a name two
    // skills share is refused rather than guessed.
    const legacy = { ...two, relPath: "legacy/x", name: "beta" };
    expect(selectSkills([legacy, two], ["beta"], false)).toEqual([two]);
    const other = { ...two, relPath: "other/y", name: "beta" };
    expect(() => selectSkills([legacy, other], ["beta"], false)).toThrow(/names several skills/);
  });
});
