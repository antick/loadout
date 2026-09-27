import { type AgentInfo, type AgentReloadWhen, formatNameList } from "@loadout/shared";
import type { QueryClient } from "@tanstack/react-query";
import { i18n } from "@/lib/i18n";
import { keys } from "@/lib/query-keys";

/**
 * One or two sentences on when this agent sees skill changes, from its documentation. When its
 * documentation does not say, a neutral line says so and what usually works, never a guess.
 */
export function describeReload(agent: Pick<AgentInfo, "displayName" | "reload">): string {
  const reload = agent.reload;
  if (!reload) return i18n.t("agents.reload.unknown", { agent: agent.displayName });
  const vars = { agent: agent.displayName, command: reload.command, ask: reload.ask };
  const when = i18n.t(`agents.reload.${reload.when}`, vars);
  if (reload.command) return `${when} ${i18n.t(`agents.reload.command.${reload.when}`, vars)}`;
  if (reload.ask) return `${when} ${i18n.t("agents.reload.ask", vars)}`;
  return when;
}

/**
 * After skills were added to or removed from these agents: what to do so each one sees the
 * change, grouped (restart first, then new sessions, then agents whose documentation is silent).
 * Agents that notice by themselves need no word, unless every agent does. Null for no agents.
 */
export function reloadHint(
  agents: readonly Pick<AgentInfo, "displayName" | "reload">[],
): string | null {
  const names = (when: AgentReloadWhen): string[] =>
    agents.filter((agent) => agent.reload?.when === when).map((agent) => agent.displayName);
  const restart = names("restart");
  const session = names("new_session");
  const live = names("live");
  const unknown = agents.filter((agent) => !agent.reload).map((agent) => agent.displayName);
  const parts: string[] = [];
  if (restart.length > 0) {
    parts.push(i18n.t("agents.reload.hint.restart", { names: formatNameList(restart) }));
  }
  if (session.length > 0) {
    parts.push(i18n.t("agents.reload.hint.newSession", { names: formatNameList(session) }));
  }
  if (unknown.length > 0) {
    parts.push(
      i18n.t("agents.reload.hint.unknown", {
        names: formatNameList(unknown),
        count: unknown.length,
      }),
    );
  }
  if (parts.length === 0 && live.length > 0) {
    parts.push(
      i18n.t("agents.reload.hint.live", { names: formatNameList(live), count: live.length }),
    );
  }
  return parts.length > 0 ? parts.join(" ") : null;
}

/** `reloadHint` for agents named by key, read from the agent list already loaded. */
export function reloadHintFor(
  queryClient: QueryClient,
  agentKeys: readonly string[],
): string | null {
  const wanted = new Set(agentKeys);
  const agents = queryClient.getQueryData<AgentInfo[]>(keys.agents.all) ?? [];
  return reloadHint(agents.filter((agent) => wanted.has(agent.key)));
}

/** `reloadHint` for every agent a preset applies to by default: installed and switched on. */
export function reloadHintForAvailable(queryClient: QueryClient): string | null {
  const agents = queryClient.getQueryData<AgentInfo[]>(keys.agents.all) ?? [];
  return reloadHint(agents.filter((agent) => agent.installed && agent.enabled));
}
