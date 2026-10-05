import { AGENT_FIELD_KNOWLEDGE, behaviorFieldsIn, fieldNotesFor } from "@loadout/shared";
import { describe, expect, it } from "vitest";
import { parseFrontmatter } from "../src/skills/metadata";

describe("fields a skill uses that agents may skip", () => {
  it("lists behaviour fields in a fixed order and leaves name and description out", () => {
    expect(
      behaviorFieldsIn({
        name: "a",
        description: "b",
        model: "opus",
        "allowed-tools": "Read",
        hooks: { Stop: [] },
      }),
    ).toEqual(["allowed-tools", "model", "hooks"]);
  });

  it("ignores a field that asks for nothing", () => {
    expect(
      behaviorFieldsIn({
        "disable-model-invocation": false,
        "user-invocable": true,
        "allowed-tools": "  ",
        hooks: {},
        model: "",
      }),
    ).toEqual([]);
  });

  it("counts the two switches only in the direction that changes something", () => {
    expect(
      behaviorFieldsIn({ "disable-model-invocation": "True", "user-invocable": false }),
    ).toEqual(["disable-model-invocation", "user-invocable"]);
  });

  it("is read when the frontmatter of a document is parsed", () => {
    expect(parseFrontmatter("---\nname: a\nmodel: opus\n---\n").behaviorFields).toEqual(["model"]);
    expect(parseFrontmatter("no frontmatter").behaviorFields).toEqual([]);
  });
});

describe("what an agent does with them, by its own documentation", () => {
  const fields = ["allowed-tools", "disable-model-invocation", "paths", "model"];

  it("says nothing for an agent whose documentation reads every one", () => {
    expect(fieldNotesFor(fields, "claude_code")).toEqual([]);
  });

  it("says the field is ignored when the documentation lists every field it reads", () => {
    expect(fieldNotesFor(fields, "opencode").map((note) => note.level)).toEqual([
      "ignored",
      "ignored",
      "ignored",
      "ignored",
    ]);
  });

  it("only says a field is undocumented when the documentation is a table that may not be complete", () => {
    expect(fieldNotesFor(fields, "cursor")).toEqual([
      { field: "allowed-tools", level: "undocumented" },
      { field: "model", level: "undocumented" },
    ]);
  });

  it("says nothing for an agent Loadout has no documentation for", () => {
    expect(fieldNotesFor(fields, "codex")).toEqual([]);
    expect(fieldNotesFor(fields, "no_such_agent")).toEqual([]);
  });

  it("says nothing about fields the skill does not use", () => {
    expect(fieldNotesFor([], "opencode")).toEqual([]);
  });

  it("gives every agent it knows a place to read the documentation", () => {
    for (const knowledge of Object.values(AGENT_FIELD_KNOWLEDGE)) {
      expect(knowledge.source).toMatch(/^https:\/\//);
    }
  });
});
