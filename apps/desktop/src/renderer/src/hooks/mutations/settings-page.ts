import {
  type AgentInfo,
  APP_NAME,
  type CustomAgentInput,
  formatDateTime,
  type LibraryLocation,
  type LogExport,
} from "@loadout/shared";
import {
  type QueryClient,
  type UseMutationResult,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { keys } from "@/lib/query-keys";
import { toastError, toastSuccess } from "@/lib/toast";

/** Switching or re-pointing an agent moves deployments, so skills and workspaces follow. */
function invalidateAgents(queryClient: QueryClient): void {
  for (const queryKey of [keys.agents.root, keys.skills.root, keys.workspace.root]) {
    void queryClient.invalidateQueries({ queryKey });
  }
}

/** Patch one agent in the cached list so switches answer at once. */
function patchAgent(queryClient: QueryClient, key: string, patch: Partial<AgentInfo>): void {
  queryClient.setQueryData<AgentInfo[]>(keys.agents.all, (agents) =>
    agents?.map((agent) => (agent.key === key ? { ...agent, ...patch } : agent)),
  );
}

export function useSetAgentEnabled(): UseMutationResult<
  void,
  unknown,
  { key: string; enabled: boolean }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ key, enabled }) => api.agents.setEnabled(key, enabled),
    onMutate: ({ key, enabled }) => patchAgent(queryClient, key, { enabled }),
    onError: (error) => toastError(error, "settings.agents.errors.save"),
    onSettled: () => invalidateAgents(queryClient),
  });
}

export function useSetAllAgentsEnabled(): UseMutationResult<void, unknown, boolean> {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (enabled: boolean) => api.agents.setAllEnabled(enabled),
    onSuccess: (_result, enabled) =>
      toastSuccess(t(enabled ? "settings.agents.allEnabled" : "settings.agents.allDisabled")),
    onError: (error) => toastError(error, "settings.agents.errors.save"),
    onSettled: () => invalidateAgents(queryClient),
  });
}

/** Persist the agent order. Takes every agent key, in the new order. */
export function useSetAgentOrder(): UseMutationResult<
  void,
  unknown,
  string[],
  { previous?: AgentInfo[] }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (agentKeys: string[]) => api.agents.setOrder(agentKeys),
    onMutate: async (agentKeys) => {
      await queryClient.cancelQueries({ queryKey: keys.agents.all });
      const previous = queryClient.getQueryData<AgentInfo[]>(keys.agents.all);
      if (previous) {
        const rank = new Map(agentKeys.map((key, index) => [key, index]));
        const last = Number.MAX_SAFE_INTEGER;
        queryClient.setQueryData(
          keys.agents.all,
          [...previous].sort((a, b) => (rank.get(a.key) ?? last) - (rank.get(b.key) ?? last)),
        );
      }
      return { previous };
    },
    onError: (error, _keys, context) => {
      if (context?.previous) queryClient.setQueryData(keys.agents.all, context.previous);
      toastError(error, "errors.reorder");
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.agents.root }),
  });
}

/** Add a custom agent. The form shows the backend's validation message itself. */
export function useAddCustomAgent(): UseMutationResult<AgentInfo, unknown, CustomAgentInput> {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (input: CustomAgentInput) => api.agents.addCustom(input),
    onSuccess: (agent) => toastSuccess(t("settings.agents.added", { name: agent.displayName })),
    onSettled: () => invalidateAgents(queryClient),
  });
}

export function useRemoveCustomAgent(): UseMutationResult<void, unknown, AgentInfo> {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (agent: AgentInfo) => api.agents.removeCustom(agent.key),
    onSuccess: (_result, agent) =>
      toastSuccess(t("settings.agents.removed", { name: agent.displayName })),
    onError: (error) => toastError(error, "settings.agents.errors.remove"),
    onSettled: () => invalidateAgents(queryClient),
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
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: ({ key, kind, path, reset }: SetAgentPathInput) => {
      if (kind === "global") {
        return reset ? api.agents.resetSkillsDir(key) : api.agents.setSkillsDir(key, path ?? "");
      }
      return reset
        ? api.agents.resetProjectSkillsDir(key)
        : api.agents.setProjectSkillsDir(key, path);
    },
    onSuccess: (_result, { reset }) =>
      toastSuccess(t(reset ? "settings.agents.pathReset" : "settings.agents.pathSaved")),
    onError: (error) => toastError(error, "settings.agents.errors.path"),
    onSettled: () => invalidateAgents(queryClient),
  });
}

/** Ask the OS for a folder. Resolves to null when the dialog was cancelled. */
export function usePickFolder(): UseMutationResult<string | null, unknown, string | undefined> {
  return useMutation({
    mutationFn: (title?: string) => api.app.pickFolder(title),
    onError: (error) => toastError(error),
  });
}

/** Move the library (null = back to the default folder). Takes effect after a restart. */
export function useSetLibraryPath(): UseMutationResult<LibraryLocation, unknown, string | null> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (path: string | null) => api.system.setLibraryPath(path),
    onSuccess: (location) => queryClient.setQueryData(keys.system.libraryLocation, location),
    onError: (error) => toastError(error, "settings.general.library.error"),
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.system.libraryLocation }),
  });
}

export function useRevealLibrary(): UseMutationResult<void, unknown, void> {
  return useMutation({
    mutationFn: () => api.system.revealLibrary(),
    onError: (error) => toastError(error, "errors.reveal"),
  });
}

export function useRestartApp(): UseMutationResult<void, unknown, void> {
  return useMutation({
    mutationFn: () => api.app.restart(),
    onError: (error) => toastError(error),
  });
}

/** Write the logs to a zip file and offer to show it. */
export function useExportLogs(): UseMutationResult<LogExport, unknown, void> {
  const { t } = useTranslation();
  return useMutation({
    mutationFn: () => api.system.exportLogs(),
    onSuccess: (result) =>
      toast.success(t("settings.about.logsExported", { count: result.fileCount }), {
        description: result.zipPath,
        descriptionClassName: "font-mono text-xs break-all",
        action: {
          label: t("settings.about.revealLogs"),
          onClick: () => void api.app.revealPath(result.zipPath).catch(toastError),
        },
      }),
    onError: (error) => toastError(error, "settings.about.logsFailed"),
  });
}

const CODE_FENCE = "```";

/**
 * Version, system, agents, last crash and a log excerpt as Markdown on the clipboard. The report
 * is written in English on purpose: it is pasted into bug reports for the maintainers to read.
 */
export function useCopyDiagnostics(): UseMutationResult<void, unknown, void> {
  const { t } = useTranslation();
  return useMutation({
    mutationFn: async () => {
      const [info, log, crash, agents] = await Promise.all([
        api.system.diagnostics(),
        api.system.logExcerpt(),
        api.system.lastCrash(),
        api.agents.list(),
      ]);
      const enabled = agents.filter((agent) => agent.installed && agent.enabled);
      const lines = [
        `## ${APP_NAME} diagnostics`,
        "",
        `- Version: ${info.appVersion}`,
        `- System: ${info.os} ${info.osVersion} (${info.arch})`,
        `- Git: ${info.gitVersion ?? "not found"}`,
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
    onSuccess: () => toastSuccess(t("settings.about.diagnosticsCopied")),
    onError: (error) => toastError(error, "errors.copy"),
  });
}
