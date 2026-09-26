import type { Project } from "@loadout/shared";
import { describe, expect, it } from "vitest";
import { frequentProjects, pinnedProjects } from "./project-shortcuts";

function project(id: string, patch: Partial<Project> = {}): Project {
  return {
    id,
    name: id,
    path: `/code/${id}`,
    type: "project",
    supportsToggle: true,
    sortOrder: 0,
    skillCount: 0,
    syncHealth: { local_only: 0, in_sync: 0, local_newer: 0, library_newer: 0, diverged: 0 },
    missing: false,
    pinned: false,
    recentOpens: 0,
    lastOpenedAt: null,
    createdAt: 0,
    updatedAt: 0,
    ...patch,
  };
}

describe("project shortcuts", () => {
  it("keeps pinned projects in the user's order", () => {
    const list = [project("a", { pinned: true }), project("b"), project("c", { pinned: true })];
    expect(pinnedProjects(list).map((p) => p.id)).toEqual(["a", "c"]);
  });

  it("lists the three most opened unpinned projects once the list is long", () => {
    const list = [
      project("a", { recentOpens: 9, pinned: true }),
      project("b", { recentOpens: 2, lastOpenedAt: 5 }),
      project("c", { recentOpens: 7 }),
      project("d", { recentOpens: 2, lastOpenedAt: 9 }),
      project("e", { recentOpens: 1 }),
      project("f"),
      project("g"),
    ];
    expect(frequentProjects(list).map((p) => p.id)).toEqual(["c", "d", "b"]);
    expect(frequentProjects(list.slice(0, 6))).toEqual([]);
  });
});
