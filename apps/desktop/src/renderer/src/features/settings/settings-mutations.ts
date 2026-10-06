import {
  type AgentInfo,
  APP_NAME,
  type ClawhubAccount,
  type CustomAgentInput,
  formatDateTime,
  isAgentAvailable,
  type LibraryLocation,
  type LogExport,
} from "@loadout/shared";
import { type UseMutationResult, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { useReorderMutation } from "@/hooks/use-reorder-mutation";
import { api } from "@/lib/api";
import { type CacheSnapshot, patchCached, restoreCached } from "@/lib/optimistic";
import { keys } from "@/lib/query-keys";
import { toastError } from "@/lib/toast";

/** Switch an agent on or off; the switch answers at once and flips back if saving fails. */
export function useSetAgentEnabled(): UseMutationResult<
  { removed: string[] },
  unknown,
  { key: string; enabled: boolean },
  CacheSnapshot
> {
  const queryClient = useQueryClient();
  return useApiMutation({
    fn: ({ key, enabled }) => api.agents.setEnabled(key, enabled),
    onMutate: ({ key, enabled }) =>
      patchCached<AgentInfo[]>(queryClient, keys.agents.all, (agents) =>
        agents.map((agent) => (agent.key === key ? { ...agent, enabled } : agent)),
      ),
    error: "settings.agents.errors.save",
    onError: (_error, _input, context) => restoreCached(queryClient, context),
  });
}

export function useSetAllAgentsEnabled(): UseMutationResult<void, unknown, boolean> {
  const { t } = useTranslation();
  return useApiMutation({
    fn: (enabled: boolean) => api.agents.setAllEnabled(enabled),
    success: (_result, enabled) =>
      t(enabled ? "settings.agents.allEnabled" : "settings.agents.allDisabled"),
    error: "settings.agents.errors.save",
  });
}

/** Persist the agent order. Takes every agent key, in the new order. */
export function useSetAgentOrder(): UseMutationResult<void, unknown, string[], CacheSnapshot> {
  return useReorderMutation<AgentInfo>(
    keys.agents.all,
    (agentKeys) => api.agents.setOrder(agentKeys),
    (agent) => agent.key,
  );
}

/** Add a custom agent. The form shows the backend's validation message itself. */
export function useAddCustomAgent(): UseMutationResult<AgentInfo, unknown, CustomAgentInput> {
  const { t } = useTranslation();
  return useApiMutation({
    fn: (input: CustomAgentInput) => api.agents.addCustom(input),
    error: false,
    success: (agent) => t("settings.agents.added", { name: agent.displayName }),
  });
}

export function useRemoveCustomAgent(): UseMutationResult<void, unknown, AgentInfo> {
  const { t } = useTranslation();
  return useApiMutation({
    fn: (agent: AgentInfo) => api.agents.removeCustom(agent.key),
    success: (_result, agent) => t("settings.agents.removed", { name: agent.displayName }),
    error: "settings.agents.errors.remove",
  });
}

export type AgentPathKind = "global" | "project";

export interface SetAgentPathInput {
  key: string;
  kind: AgentPathKind;
  /** The new path. Null clears a custom agent's project path. Ignored when `reset` is set. */
  path: string | null;
  /** Built-in agents only: go back to the default path. */
  reset?: boolean;
}

/** Change or reset where an agent keeps its skills, globally or inside projects. */
export function useSetAgentPath(): UseMutationResult<void, unknown, SetAgentPathInput> {
  const { t } = useTranslation();
  return useApiMutation({
    fn: ({ key, kind, path, reset }: SetAgentPathInput) => {
      if (kind === "global") {
        return reset ? api.agents.resetSkillsDir(key) : api.agents.setSkillsDir(key, path ?? "");
      }
      return reset
        ? api.agents.resetProjectSkillsDir(key)
        : api.agents.setProjectSkillsDir(key, path);
    },
    success: (_result, { reset }) =>
      t(reset ? "settings.agents.pathReset" : "settings.agents.pathSaved"),
    error: "settings.agents.errors.path",
  });
}

/** Move the library (null = back to the default folder). Takes effect after a restart. */
export function useSetLibraryPath(): UseMutationResult<LibraryLocation, unknown, string | null> {
  const queryClient = useQueryClient();
  return useApiMutation({
    fn: (path: string | null) => api.system.setLibraryPath(path),
    onSuccess: (location) => queryClient.setQueryData(keys.system.libraryLocation, location),
    error: "settings.general.library.error",
  });
}

export function useRevealLibrary(): UseMutationResult<void, unknown, void> {
  return useApiMutation({
    fn: () => api.system.revealLibrary(),
    error: "errors.reveal",
  });
}

/** Write the logs to a zip file and offer to show it. */
export function useExportLogs(): UseMutationResult<LogExport, unknown, void> {
  const { t } = useTranslation();
  return useApiMutation({
    fn: () => api.system.exportLogs(),
    onSuccess: (result) =>
      toast.success(t("settings.about.logsExported", { count: result.fileCount }), {
        description: result.zipPath,
        descriptionClassName: "font-mono text-xs break-all",
        action: {
          label: t("settings.about.revealLogs"),
          onClick: () => void api.app.revealPath(result.zipPath).catch(toastError),
        },
      }),
    error: "settings.about.logsFailed",
  });
}

const CODE_FENCE = "```";

/**
 * Version, system, agents, last crash and a log excerpt as Markdown on the clipboard. The report
 * is written in English on purpose: it is pasted into bug reports for the maintainers to read.
 */
export function useCopyDiagnostics(): UseMutationResult<void, unknown, void> {
  const { t } = useTranslation();
  return useApiMutation({
    fn: async () => {
      const [info, log, crash, agents] = await Promise.all([
        api.system.diagnostics(),
        api.system.logExcerpt(),
        api.system.lastCrash(),
        api.agents.list(),
      ]);
      const enabled = agents.filter(isAgentAvailable);
      const lines = [
        `## ${APP_NAME} diagnostics`,
        "",
        `- Version: ${info.appVersion}`,
        `- System: ${info.os} ${info.osVersion} (${info.arch})`,
        `- Git: ${info.gitVersion ?? "not found"}`,
        `- GitHub sign-in for Git: ${info.githubSignIn ?? "none"}`,
        `- Library location: ${info.libraryPathOverridden ? "custom" : "default"}`,
        `- Enabled agents: ${enabled.map((agent) => agent.key).join(", ") || "none"}`,
        `- Last crash: ${crash ? `${formatDateTime(crash.at)} ${crash.message}` : "none"}`,
        "",
        `### Log excerpt (lines: ${log.lineCount}${log.hasWarnings ? ", has warnings" : ""})`,
        "",
        CODE_FENCE,
        log.excerpt.trimEnd(),
        CODE_FENCE,
      ];
      await api.app.copyText(lines.join("\n"));
    },
    success: () => t("settings.about.diagnosticsCopied"),
    error: "errors.copy",
  });
}

/** Save a ClawHub token once the registry confirms it; null forgets the saved one. */
export function useSetClawhubToken(): UseMutationResult<ClawhubAccount, unknown, string | null> {
  const { t } = useTranslation();
  return useApiMutation({
    fn: (token) => api.publish.setClawhubToken(token),
    success: (account) =>
      account.handle
        ? t("settings.marketplaces.clawhub.saved", { handle: account.handle })
        : t("settings.marketplaces.clawhub.forgotten"),
    error: "settings.marketplaces.clawhub.errors.save",
    invalidate: [keys.publish.root],
  });
}
