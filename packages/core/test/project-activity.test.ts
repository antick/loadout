import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PROJECT_OPENS_WINDOW_MS, ProjectActivity } from "../src/projects/activity";
import { type WorkspaceWorld, createWorkspaceWorld } from "./workspace-world";

const T0 = Date.UTC(2026, 0, 1);
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

describe("pinned and frequently opened projects", () => {
  let world: WorkspaceWorld;
  let activity: ProjectActivity;

  beforeEach(() => {
    world = createWorkspaceWorld();
    activity = new ProjectActivity(world.ctx.settings);
  });
  afterEach(() => world.cleanup());

  it("counts a visit once and forgets opens older than 30 days", () => {
    expect(activity.recordOpen("p", T0)).toBe(true);
    // Coming back within the same visit does not count again.
    expect(activity.recordOpen("p", T0 + 5 * MINUTE)).toBe(false);
    expect(activity.recordOpen("p", T0 + 20 * MINUTE)).toBe(true);
    expect(activity.summary("p", T0 + DAY)).toEqual({
      pinned: false,
      recentOpens: 2,
      lastOpenedAt: T0 + 20 * MINUTE,
    });
    expect(activity.summary("p", T0 + PROJECT_OPENS_WINDOW_MS + 30 * MINUTE).recentOpens).toBe(0);
    expect(activity.summary("other", T0)).toEqual({
      pinned: false,
      recentOpens: 0,
      lastOpenedAt: null,
    });
  });

  it("pins and unpins through the API, reports it on the project, and forgets on remove", async () => {
    const repo = join(world.root, "work", "repo");
    mkdirSync(repo, { recursive: true });
    const project = await world.projects.api.add(repo);
    expect(project).toMatchObject({ pinned: false, recentOpens: 0, lastOpenedAt: null });

    await world.projects.api.setPinned(project.id, true);
    await world.projects.api.recordOpen(project.id);
    const [listed] = await world.projects.api.list();
    expect(listed).toMatchObject({ pinned: true, recentOpens: 1 });
    expect(listed?.lastOpenedAt).toBeTypeOf("number");

    await world.projects.api.setPinned(project.id, false);
    expect((await world.projects.api.list())[0]?.pinned).toBe(false);
    await expect(world.projects.api.setPinned("nope", true)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });

    await world.projects.api.setPinned(project.id, true);
    await world.projects.api.remove(project.id);
    expect(activity.summary(project.id)).toEqual({
      pinned: false,
      recentOpens: 0,
      lastOpenedAt: null,
    });
  });
});
