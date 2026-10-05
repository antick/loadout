import type { SyncPreview, SyncPreviewItem } from "@loadout/shared";
import { describe, expect, it } from "vitest";
import { filterReview, reviewSize } from "./review-filter";

const item = (
  name: string,
  change: SyncPreviewItem["change"],
  extra: Partial<SyncPreviewItem> = {},
): SyncPreviewItem => ({
  id: name,
  name,
  change,
  path: name,
  previousPath: null,
  fromDevice: null,
  ...extra,
});

const preview: SyncPreview = {
  remoteCommit: "c0ffee",
  localTree: "7ree",
  perSkill: true,
  incoming: [
    item("pdf-tools", "added", { fromDevice: "Work Laptop" }),
    item("code-review", "renamed", { previousPath: "review" }),
    item("old-notes", "deleted"),
  ],
  outgoing: [item("writing-style", "changed"), item("scratch", "deleted")],
  conflicts: [item("commit-helper", "changed")],
  presetsIncoming: 0,
  remoteBackups: 2,
  manyDeletes: false,
};

const names = (lists: ReturnType<typeof filterReview>): string[][] => [
  lists.incoming.map((entry) => entry.name),
  lists.outgoing.map((entry) => entry.name),
  lists.conflicts.map((entry) => entry.name),
];

describe("sync review search", () => {
  it("keeps everything with no search", () => {
    expect(names(filterReview(preview, "  "))).toEqual([
      ["pdf-tools", "code-review", "old-notes"],
      ["writing-style", "scratch"],
      ["commit-helper"],
    ]);
  });

  it("searches the name, the old folder name and the device", () => {
    expect(names(filterReview(preview, "REVIEW"))).toEqual([["code-review"], [], []]);
    expect(names(filterReview(preview, "work lap"))).toEqual([["pdf-tools"], [], []]);
    expect(names(filterReview(preview, "helper"))).toEqual([[], [], ["commit-helper"]]);
  });

  it("counts the rows of both directions and the conflicts", () => {
    expect(reviewSize(preview)).toBe(6);
  });
});
