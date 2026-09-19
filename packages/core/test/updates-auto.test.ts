import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { Skill, UpdateResult } from "@skillboard/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../src/errors";
import {
  AUTO_FIRST_TICK_MS,
  AUTO_SKILL_PAUSE_MS,
  AUTO_TICK_MS,
  type AutoUpdateTarget,
  createAutoUpdater,
} from "../src/updates";
import { type TestWorld, createTestWorld, makeSkill, writeFile } from "./helpers";
import { commitAll } from "./install-fixtures";
import { type UpdatesWorld, createUpdatesWorld } from "./updates-world";

const HOUR_MS = 60 * 60_000;

describe("auto-updater schedule", () => {
  let world: TestWorld;
  let skills: Skill[];
  let calls: string[];
  let events: unknown[];
  /** What the stub update does for a skill id. */
  let updateOutcome: (skillId: string) => Partial<UpdateResult>;

  function fakeSkill(name: string, patch: Partial<Skill> = {}): Skill {
    const libraryPath = makeSkill(world.ctx.paths.skillsDir, name);
    const row = world.store.insert({
      name,
      description: null,
      sourceType: "git",
      sourceUrl: "https://example.invalid/repo.git",
      libraryPath,
      contentHash: null,
      updateStatus: "update_available",
    });
    return world.store.update(row.id, patch);
  }

  const target: AutoUpdateTarget = {
    skills: () => skills,
    check: async (skillId, options) => {
      calls.push(`check:${skillId}:${options.force}:${options.lockMode}`);
      const skill = skills.find((s) => s.id === skillId);
      if (!skill) throw new Error("unknown skill");
      if (skill.name === "busy") throw new AppError("BUSY", "busy");
      return skill;
    },
    update: async (skillId, approval, options) => {
      calls.push(`update:${skillId}:${approval}:${options.lockMode}`);
      const skill = skills.find((s) => s.id === skillId) as Skill;
      if (skill.name === "explodes") throw new AppError("GIT", "boom");
      return {
        skill,
        contentChanged: true,
        pendingRemovals: [],
        approval: null,
        ...updateOutcome(skillId),
      };
    },
  };

  beforeEach(() => {
    vi.useFakeTimers();
    world = createTestWorld();
    skills = [];
    calls = [];
    events = [];
    updateOutcome = () => ({});
    world.ctx.emit = (event, payload) => {
      if (event === "updates:auto-ran") events.push(payload);
    };
  });
  afterEach(() => {
    vi.useRealTimers();
    world.cleanup();
  });

  it("waits a minute, runs when the interval has passed, then ticks every quarter hour", async () => {
    skills = [fakeSkill("alpha", { updateStatus: "up_to_date" })];
    world.ctx.settings.set("autoUpdateInterval", "1h");
    const auto = createAutoUpdater(world.ctx, target);
    auto.start();

    await vi.advanceTimersByTimeAsync(AUTO_FIRST_TICK_MS - 1);
    expect(calls).toEqual([]);
    await vi.advanceTimersByTimeAsync(1 + AUTO_SKILL_PAUSE_MS);
    expect(calls).toEqual([`check:${skills[0]?.id}:true:try`]);
    expect(events).toHaveLength(1);
    const firstRun = world.ctx.settings.get("autoUpdateLastRunAt");
    expect(firstRun).toBeGreaterThan(0);

    // Three more ticks fall inside the hour: nothing runs.
    await vi.advanceTimersByTimeAsync(3 * AUTO_TICK_MS);
    expect(events).toHaveLength(1);
    // The tick after the hour has passed runs the next round.
    await vi.advanceTimersByTimeAsync(AUTO_TICK_MS + AUTO_SKILL_PAUSE_MS);
    expect(events).toHaveLength(2);
    expect(world.ctx.settings.get("autoUpdateLastRunAt")).toBeGreaterThanOrEqual(
      firstRun + HOUR_MS,
    );

    auto.stop();
    await vi.advanceTimersByTimeAsync(2 * HOUR_MS);
    expect(events).toHaveLength(2);
  });

  it("never runs while the interval is off", async () => {
    skills = [fakeSkill("alpha")];
    const auto = createAutoUpdater(world.ctx, target);
    auto.start();
    await vi.advanceTimersByTimeAsync(AUTO_FIRST_TICK_MS + 4 * AUTO_TICK_MS);
    expect(calls).toEqual([]);
    auto.stop();
  });

  it("only reports updates unless applying is switched on", async () => {
    skills = [fakeSkill("alpha"), fakeSkill("beta", { updateStatus: "error" })];
    const auto = createAutoUpdater(world.ctx, target);
    const pending = auto.runNow();
    await vi.advanceTimersByTimeAsync(2 * AUTO_SKILL_PAUSE_MS);
    expect(await pending).toMatchObject({ updated: 0, available: 1, failed: 1 });
    expect(calls.filter((call) => call.startsWith("update:"))).toEqual([]);
  });

  it("applies git updates without approval and counts what it could not do", async () => {
    world.ctx.settings.set("autoUpdateApply", true);
    skills = [
      fakeSkill("applied"),
      fakeSkill("held"),
      fakeSkill("elsewhere"),
      fakeSkill("explodes"),
      fakeSkill("busy"),
      fakeSkill("local", { sourceType: "local", sourceUrl: null, sourceRef: "/somewhere" }),
      fakeSkill("untracked", { sourceType: "local", sourceUrl: null, updateStatus: "local_only" }),
    ];
    const idOf = (name: string): string => skills.find((s) => s.name === name)?.id ?? "";
    updateOutcome = (skillId) => {
      if (skillId === idOf("held")) {
        return { pendingRemovals: [{ location: "library", path: "notes/" }], approval: "token" };
      }
      return skillId === idOf("elsewhere") ? { contentChanged: false } : {};
    };

    const auto = createAutoUpdater(world.ctx, target);
    const pending = auto.runNow();
    // A second request joins the round already running.
    expect(auto.runNow()).toBe(pending);
    await vi.advanceTimersByTimeAsync(skills.length * AUTO_SKILL_PAUSE_MS);
    const summary = await pending;

    // held + local stay available; explodes fails; busy and untracked are left for later.
    expect(summary).toMatchObject({ updated: 1, available: 2, failed: 1 });
    expect(events).toEqual([summary]);
    expect(calls).not.toContain(`check:${idOf("untracked")}:true:try`);
    expect(calls).not.toContain(`update:${idOf("local")}:null:try`);
    expect(calls).toContain(`update:${idOf("applied")}:null:try`);
  });

  it("stops half way without recording the round", async () => {
    skills = [fakeSkill("alpha"), fakeSkill("beta")];
    const auto = createAutoUpdater(world.ctx, target);
    const pending = auto.runNow();
    await vi.advanceTimersByTimeAsync(AUTO_SKILL_PAUSE_MS);
    auto.stop();
    await vi.advanceTimersByTimeAsync(AUTO_SKILL_PAUSE_MS);
    await pending;
    expect(calls).toHaveLength(1);
    expect(events).toEqual([]);
    expect(world.ctx.settings.get("autoUpdateLastRunAt")).toBe(0);
  });
});

describe("auto-updater round over real services", () => {
  let world: UpdatesWorld;

  beforeEach(() => {
    world = createUpdatesWorld();
  });
  afterEach(() => world.restore());

  it("updates what is safe, holds back removals, and only checks local sources", async () => {
    world.ctx.settings.set("autoUpdateApply", true);
    const pdf = await world.installFromGit("pdf");
    const docx = await world.installFromGit("docx");
    const sourceDir = makeSkill(join(world.root, "work"), "helper");
    const helper = await world.install.api.fromPath(sourceDir);

    rmSync(join(world.remote, "skills", "pdf", "notes"), { recursive: true });
    writeFile(join(world.remote, "skills", "docx", "extra.md"), "more");
    const next = commitAll(world.remote, "changes");
    writeFile(join(sourceDir, "extra.md"), "local change");

    const summary = await world.updates.auto.runNow();
    expect(summary).toMatchObject({ updated: 1, available: 2, failed: 0 });
    expect(world.ctx.settings.get("autoUpdateLastRunAt")).toBe(summary.ranAt);
    expect(world.install.events.filter(({ event }) => event === "updates:auto-ran")).toEqual([
      { event: "updates:auto-ran", payload: summary },
    ]);

    expect(world.store.get(docx.id)).toMatchObject({
      sourceRevision: next,
      updateStatus: "up_to_date",
    });
    expect(readFileSync(join(docx.libraryPath, "extra.md"), "utf8")).toBe("more");
    // Would delete files: nobody approved that, so it only says an update is there.
    expect(world.store.get(pdf.id)).toMatchObject({
      sourceRevision: pdf.sourceRevision,
      updateStatus: "update_available",
    });
    expect(existsSync(join(pdf.libraryPath, "notes", "old.md"))).toBe(true);
    expect(world.store.get(helper.id).updateStatus).toBe("update_available");
    expect(existsSync(join(helper.libraryPath, "extra.md"))).toBe(false);
  });
});
