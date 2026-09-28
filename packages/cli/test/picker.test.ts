import { join } from "node:path";
import type { LibraryNameEntry, RepoSkillPreview } from "@loadout/shared";
import { describe, expect, it } from "vitest";
import { PLAIN_STYLES, renderPicker, scrollTop } from "../src/picker/render";
import {
  NOTHING_TICKED,
  type PickRequest,
  type PickerKey,
  type PickerState,
  createPickerState,
  pickerStep,
  visibleLines,
} from "../src/picker/state";
import { createSandbox, writeSkill } from "./harness";

function row(relPath: string, extra: Partial<RepoSkillPreview> = {}): RepoSkillPreview {
  const name = relPath.split("/").at(-1) ?? relPath;
  return {
    relPath,
    name,
    description: `About ${name}`,
    manualOnly: false,
    alreadyInstalled: false,
    ...extra,
  };
}

const taken: LibraryNameEntry = {
  dirName: "beta",
  skillId: "b",
  skillName: "beta",
  source: "acme/other",
  sameSource: false,
};

const REQUEST: PickRequest = {
  source: "acme/skills",
  skills: [row("skills/alpha"), row("skills/beta"), row("tools/gamma", { manualOnly: true })],
  library: [taken],
  selected: null,
};

const KEYS = {
  down: { name: "down" },
  up: { name: "up" },
  space: { name: "space", sequence: " " },
  all: { name: "a", sequence: "a" },
  enter: { name: "return" },
  escape: { name: "escape" },
  slash: { sequence: "/" },
} satisfies Record<string, PickerKey>;

/** Press keys in order; fails when one of them ends the picker early. */
function press(state: PickerState, ...keys: PickerKey[]): PickerState {
  return keys.reduce((current, key) => {
    const step = pickerStep(current, key);
    if (step.type !== "continue") throw new Error(`picker ended on ${JSON.stringify(key)}`);
    return step.state;
  }, state);
}

const typed = (text: string): PickerKey[] => [...text].map((sequence) => ({ sequence }));

describe("picker state", () => {
  it("starts with free names ticked and folders shown", () => {
    const state = createPickerState(REQUEST);
    expect([...state.checked]).toEqual(["skills/alpha", "tools/gamma"]);
    expect(visibleLines(state).map((line) => line.type)).toEqual([
      "folder",
      "skill",
      "skill",
      "folder",
      "skill",
    ]);
  });

  it("ticks one skill, a whole folder, or everything", () => {
    const start = createPickerState(REQUEST);
    // Cursor on the `skills/` heading: partly ticked, so space ticks the rest.
    const folder = press(start, KEYS.space);
    expect(folder.checked.has("skills/beta")).toBe(true);
    const one = press(folder, KEYS.down, KEYS.space);
    expect(one.checked.has("skills/alpha")).toBe(false);
    const none = press(createPickerState(REQUEST), KEYS.all, KEYS.all);
    expect(none.checked.size).toBe(0);
  });

  it("filters while typing, and select all only takes what shows", () => {
    const filtered = press(createPickerState(REQUEST), KEYS.slash, ...typed("gam"), KEYS.enter);
    expect(filtered).toMatchObject({ filter: "gam", filtering: false });
    expect(visibleLines(filtered).filter((line) => line.type === "skill")).toHaveLength(1);
    const cleared = press(filtered, KEYS.all);
    expect([...cleared.checked]).toEqual(["skills/alpha"]);
    expect(press(filtered, KEYS.slash, KEYS.escape).filter).toBe("");
  });

  it("confirms in source order, refuses an empty choice, and cancels", () => {
    const state = createPickerState(REQUEST);
    expect(pickerStep(state, KEYS.enter)).toEqual({
      type: "confirm",
      keys: ["skills/alpha", "tools/gamma"],
    });
    const empty = press(state, KEYS.all, KEYS.all);
    const refused = pickerStep(empty, KEYS.enter);
    expect(refused).toMatchObject({ type: "continue", state: { message: NOTHING_TICKED } });
    expect(pickerStep(state, KEYS.escape)).toEqual({ type: "cancel" });
    expect(pickerStep(state, { name: "c", ctrl: true })).toEqual({ type: "cancel" });
  });

  it("keeps the cursor inside the list", () => {
    const state = createPickerState(REQUEST);
    expect(press(state, KEYS.up).cursor).toBe(0);
    expect(press(state, { name: "end" }).cursor).toBe(4);
    expect(press(state, { name: "pagedown" }).cursor).toBe(4);
  });
});

describe("picker screen", () => {
  it("shows what each name will do and fits the width", () => {
    const state = press(createPickerState(REQUEST), KEYS.down, KEYS.down, KEYS.space);
    const lines = renderPicker(state, 90, 20, PLAIN_STYLES);
    expect(lines[0]).toBe("Choose skills to install from acme/skills");
    expect(lines.some((line) => line.includes("[x] beta  name in use → beta-2"))).toBe(true);
    expect(lines.some((line) => line.includes("gamma  manual only"))).toBe(true);
    expect(lines.at(-1)).toBe("3 of 3 ticked · 1 name in use");
    expect(lines.every((line) => [...line].length <= 90)).toBe(true);
    const narrow = renderPicker(state, 30, 20, PLAIN_STYLES);
    expect(narrow.every((line) => [...line].length <= 30)).toBe(true);
  });

  it("scrolls so the cursor stays on screen", () => {
    expect(scrollTop(0, 5, 10)).toBe(0);
    expect(scrollTop(50, 100, 10)).toBe(45);
    expect(scrollTop(99, 100, 10)).toBe(90);
  });
});

/** A zip of three skills, made with the CLI's own export in a throwaway library. */
async function threeSkillZip(): Promise<{ zip: string; cleanup(): void }> {
  const maker = createSandbox();
  for (const name of ["alpha", "beta", "gamma"]) {
    await maker.cli("skills", "install", writeSkill(maker.root, name));
  }
  const zip = join(maker.root, "pack.zip");
  await maker.cli("skills", "export", "--all", "--out", zip);
  return { zip, cleanup: () => maker.cleanup() };
}

describe("skills install with the picker", () => {
  it("asks in a terminal, and installs what was ticked", async () => {
    const pack = await threeSkillZip();
    const asked: PickRequest[] = [];
    const box = createSandbox({
      picker: async (request) => {
        asked.push(request);
        return request.skills.filter((s) => s.name !== "beta").map((s) => s.relPath);
      },
    });
    try {
      const run = await box.cli("skills", "install", pack.zip);
      expect(run.code).toBe(0);
      expect(asked[0]?.skills.map((s) => s.name)).toEqual(["alpha", "beta", "gamma"]);
      expect(run.stdout).toContain("Installed alpha");
      expect(run.stdout).not.toContain("Installed beta");
      const cancelled = createSandbox({ picker: async () => null });
      const stopped = await cancelled.cli("skills", "install", pack.zip);
      expect(stopped.code).toBe(1);
      expect(stopped.stderr).toContain("Nothing was installed");
      cancelled.cleanup();
    } finally {
      box.cleanup();
      pack.cleanup();
    }
  });

  it("never asks with --json, --all or --skill, or without a terminal", async () => {
    const pack = await threeSkillZip();
    let asked = 0;
    const box = createSandbox({
      picker: async () => {
        asked += 1;
        return null;
      },
    });
    const plain = createSandbox();
    try {
      expect((await box.cli("skills", "install", pack.zip, "--json")).code).toBe(2);
      expect((await box.cli("skills", "install", pack.zip, "--skill", "beta")).code).toBe(0);
      expect((await plain.cli("skills", "install", pack.zip)).code).toBe(2);
      expect(asked).toBe(0);
    } finally {
      box.cleanup();
      plain.cleanup();
      pack.cleanup();
    }
  });
});
