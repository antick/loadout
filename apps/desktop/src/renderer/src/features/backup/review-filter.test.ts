import type { SyncPreview, SyncPreviewItem } from "@loadout/shared";
import { describe, expect, it } from "vitest";
import { countReview, filterReview } from "./review-filter";

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

describe("sync review filter", () => {
  it("keeps everything with no search and no filter", () => {
    expect(names(filterReview(preview, "  ", "all"))).toEqual([
      ["pdf-tools", "code-review", "old-notes"],
      ["writing-style", "scratch"],
      ["commit-helper"],
    ]);
  });

  it("narrows every list to one kind of change", () => {
    expect(names(filterReview(preview, "", "deleted"))).toEqual([["old-notes"], ["scratch"], []]);
    // Conflicts are their own kind, even though they are changes too.
    expect(names(filterReview(preview, "", "changed"))).toEqual([[], ["writing-style"], []]);
    expect(names(filterReview(preview, "", "conflict"))).toEqual([[], [], ["commit-helper"]]);
  });

  it("searches the name, the old folder name and the device", () => {
    expect(names(filterReview(preview, "REVIEW", "all"))).toEqual([["code-review"], [], []]);
    expect(names(filterReview(preview, "work lap", "all"))).toEqual([["pdf-tools"], [], []]);
    expect(names(filterReview(preview, "notes", "renamed"))).toEqual([[], [], []]);
  });

  it("counts each kind across both directions", () => {
    expect(countReview(preview)).toEqual({
      all: 6,
      added: 1,
      changed: 1,
      renamed: 1,
      details: 0,
      deleted: 2,
      conflict: 1,
    });
  });
});
