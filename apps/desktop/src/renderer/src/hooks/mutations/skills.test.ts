import type { Skill } from "@loadout/shared";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { keys } from "@/lib/query-keys";
import { restoreCached } from "@/lib/optimistic";
import { showTags } from "./skills";

vi.mock("@/lib/api", () => ({ api: {} }));

const skill = { id: "a", name: "a", tags: ["pdf", "docs"] } as unknown as Skill;
const tagsOf = (client: QueryClient): string[] | undefined =>
  client.getQueryData<Skill>(keys.skills.detail("a"))?.tags;

describe("editing a skill's tags", () => {
  it("shows each edit at once, so the next one starts from it", async () => {
    const client = new QueryClient();
    client.setQueryData(keys.skills.detail("a"), skill);
    await showTags(client, { skillId: "a", tags: ["docs"] });
    expect(tagsOf(client)).toEqual(["docs"]);
    const second = await showTags(client, { skillId: "a", tags: [] });
    expect(tagsOf(client)).toEqual([]);

    restoreCached(client, second);
    expect(tagsOf(client)).toEqual(["docs"]);
  });
});
