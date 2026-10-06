import type { Skill } from "@loadout/shared";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { keys } from "@/lib/query-keys";
import { flipDeployment, revertDeployment } from "./deploy";

vi.mock("@/lib/api", () => ({ api: {} }));

const skill = (id: string): Skill => ({ id, name: id, deployments: [] }) as unknown as Skill;
const agentsOf = (client: QueryClient, id: string): string[] =>
  client
    .getQueryData<Skill[]>(keys.skills.all)
    ?.find((s) => s.id === id)
    ?.deployments.map((d) => d.agentKey) ?? [];

describe("a refused deploy click", () => {
  it("takes back only its own badge when two clicks fail one after the other", async () => {
    const client = new QueryClient();
    client.setQueryData(keys.skills.all, [skill("a")]);
    const first = await flipDeployment(client, { skillId: "a", agentKey: "claude" }, true);
    const second = await flipDeployment(client, { skillId: "a", agentKey: "codex" }, true);
    expect(agentsOf(client, "a")).toEqual(["claude", "codex"]);

    await revertDeployment(client, { skillId: "a", agentKey: "claude" }, first);
    expect(agentsOf(client, "a")).toEqual(["codex"]);
    // The second click's snapshot still held the first one's pending row: it must not come back.
    await revertDeployment(client, { skillId: "a", agentKey: "codex" }, second);
    expect(agentsOf(client, "a")).toEqual([]);
  });
});
