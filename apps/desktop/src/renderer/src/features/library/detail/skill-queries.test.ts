import type { SourceComparison } from "@loadout/shared";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { lastSourceComparison, sourceComparisonKey } from "@/features/library/detail/skill-queries";
import { keys } from "@/lib/query-keys";
import { skill } from "@/test/skill";

const tracked = skill("pdf", {
  sourceType: "git",
  sourceUrl: "https://example.com/acme/skills.git",
  sourceSubpath: "skills/pdf",
  sourceRevision: "a".repeat(40),
  remoteRevision: "b".repeat(40),
  contentHash: "hash-1",
  lastCheckedAt: 1,
});

function comparison(revision: string): SourceComparison {
  const meta = { sourceLabel: "Git", revision };
  return {
    diff: { skillId: tracked.id, entries: [], ...meta },
    document: { filename: "SKILL.md", content: "", ...meta },
  };
}

describe("source comparison", () => {
  it("is fetched again only when what it compared changes", () => {
    const key = sourceComparisonKey(tracked);
    // Tags, deployments, names and notes say nothing about the source: same answer.
    expect(
      sourceComparisonKey({ ...tracked, tags: ["docs"], name: "pdf-tools", note: "mine" }),
    ).toEqual(key);
    expect(
      sourceComparisonKey({ ...tracked, deployments: [], presetIds: ["p"], updatedAt: 5 }),
    ).toEqual(key);
    // The library copy, the source, or a check that saw it move: a new answer.
    expect(sourceComparisonKey({ ...tracked, contentHash: "hash-2" })).not.toEqual(key);
    expect(sourceComparisonKey({ ...tracked, sourceBranch: "dev" })).not.toEqual(key);
    expect(sourceComparisonKey({ ...tracked, remoteRevision: "c".repeat(40) })).not.toEqual(key);
    expect(sourceComparisonKey({ ...tracked, lastCheckedAt: 2 })).not.toEqual(key);
    // Every key of one skill sits under one prefix, for invalidating and removing them all.
    expect(key.slice(0, 3)).toEqual([...keys.updates.comparison(tracked.id)]);
  });

  it("finds the comparison fetched last, whatever it was keyed by", () => {
    const queryClient = new QueryClient();
    expect(lastSourceComparison(queryClient, tracked.id)).toBeUndefined();
    queryClient.setQueryData(sourceComparisonKey(tracked), comparison("old"), { updatedAt: 1 });
    const checked = { ...tracked, lastCheckedAt: 9 };
    queryClient.setQueryData(sourceComparisonKey(checked), comparison("new"), { updatedAt: 2 });
    queryClient.setQueryData(sourceComparisonKey(skill("other")), comparison("x"), {
      updatedAt: 3,
    });
    expect(lastSourceComparison(queryClient, tracked.id)?.diff.revision).toBe("new");
  });
});
