import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { invalidateScopes } from "@/lib/events";
import { keys } from "@/lib/query-keys";

describe("invalidateScopes", () => {
  it("a skill change refetches the sync review's diffs, whose keys name no local state", () => {
    const client = new QueryClient();
    const previewDiff = keys.backup.previewDiff("alpha", "c0ffee");
    const conflictDiff = keys.backup.conflictDiff("alpha");
    client.setQueryData(previewDiff, {});
    client.setQueryData(conflictDiff, {});

    invalidateScopes(client, ["skills"]);

    expect(client.getQueryState(previewDiff)?.isInvalidated).toBe(true);
    expect(client.getQueryState(conflictDiff)?.isInvalidated).toBe(true);
  });
});
