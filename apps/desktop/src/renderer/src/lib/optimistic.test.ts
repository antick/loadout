import type { Skill } from "@loadout/shared";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { patchCachedSkill, restoreCached } from "./optimistic";
import { keys } from "./query-keys";

const skill = (id: string, favoritedAt: number | null = null): Skill =>
  ({ id, name: id, favoritedAt }) as Skill;

describe("instant cache changes", () => {
  it("changes a skill in the list and in its own entry, and puts both back", async () => {
    const client = new QueryClient();
    client.setQueryData(keys.skills.all, [skill("a"), skill("b")]);
    client.setQueryData(keys.skills.detail("a"), skill("a"));

    const snapshot = await patchCachedSkill(client, "a", (s) => ({ ...s, favoritedAt: 1 }));
    expect(client.getQueryData<Skill[]>(keys.skills.all)?.map((s) => s.favoritedAt)).toEqual([
      1,
      null,
    ]);
    expect(client.getQueryData<Skill>(keys.skills.detail("a"))?.favoritedAt).toBe(1);

    restoreCached(client, snapshot);
    expect(client.getQueryData<Skill[]>(keys.skills.all)?.[0]?.favoritedAt).toBeNull();
    expect(client.getQueryData<Skill>(keys.skills.detail("a"))?.favoritedAt).toBeNull();
  });

  it("leaves an entry that is not cached alone", async () => {
    const client = new QueryClient();
    expect(await patchCachedSkill(client, "a", (s) => s)).toEqual([]);
    expect(client.getQueryData(keys.skills.detail("a"))).toBeUndefined();
  });
});
