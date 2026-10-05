import type { AppEventName, AppEvents, DataScope } from "@loadout/shared";
import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { keys } from "@/lib/query-keys";

type Handler<N extends AppEventName> = (payload: AppEvents[N]) => void;
type AnyHandler = (payload: never) => void;

const handlers = new Map<AppEventName, Set<AnyHandler>>();
let detachBridge: (() => void) | null = null;

/** One bridge listener fans out to every local handler, so components never touch the bridge. */
function ensureBridge(): void {
  if (detachBridge || typeof window === "undefined" || !window.loadout) return;
  detachBridge = window.loadout.on((name, payload) => {
    for (const handler of handlers.get(name) ?? []) (handler as (p: unknown) => void)(payload);
  });
}

/** Subscribe to one main-process event outside React. Returns the unsubscribe function. */
export function onAppEvent<N extends AppEventName>(name: N, handler: Handler<N>): () => void {
  ensureBridge();
  const set = handlers.get(name) ?? new Set<AnyHandler>();
  handlers.set(name, set);
  set.add(handler as AnyHandler);
  return () => {
    set.delete(handler as AnyHandler);
  };
}

/** Subscribe to one main-process event for the lifetime of a component. */
export function useAppEvent<N extends AppEventName>(name: N, handler: Handler<N>): void {
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  });
  useEffect(() => onAppEvent(name, (payload) => latest.current(payload)), [name]);
}

/**
 * Query-key prefixes to refetch per `data:changed` scope. A skill change also moves workspace and
 * project skill lists, project health counts, marketplace "installed" flags, the activity log,
 * the repair report, whether the agent-control skill is installed, and every storage size.
 */
const SCOPE_KEYS: Record<DataScope, readonly QueryKey[]> = {
  skills: [
    keys.skills.root,
    // Core answers from its last look unless a name, description or file changed.
    keys.duplicates.root,
    keys.editor.root,
    keys.workspace.root,
    keys.projects.root,
    // Installed skills stop being news. Not all of `updates`: a comparison with the source is
    // keyed by what it compared (`sourceComparisonKey`), so it refetches only when that changes.
    keys.updates.news,
    keys.market.root,
    keys.system.activityRoot,
    keys.system.agentControl,
    keys.system.repair,
    keys.storage.root,
    // Editing a skill can add or remove something the backup would hold back, and changes what
    // an open sync review would save.
    keys.backup.secrets,
    keys.backup.localTreeRoot,
    // Reports say whether they are stale by comparing content hashes.
    keys.safety.root,
    // Runs are matched to skills by name.
    keys.usage.root,
  ],
  agents: [
    keys.agents.root,
    keys.workspace.root,
    keys.projects.root,
    keys.editor.root,
    keys.instructions.root,
  ],
  presets: [keys.presets.root, keys.skills.root, keys.backup.localTreeRoot],
  // Project copies that are replaced or deleted land in Recently removed (storage).
  projects: [keys.projects.root, keys.editor.root, keys.instructions.root, keys.storage.root],
  backup: [keys.backup.root],
  settings: [keys.settings.root, keys.system.root, keys.safety.root, keys.usage.root],
  safety: [keys.safety.root, keys.system.root],
  usage: [keys.usage.root],
  sources: [keys.updates.news],
};

/** Invalidate everything that depends on the given data scopes. */
function invalidateScopes(queryClient: QueryClient, scopes: readonly DataScope[]): void {
  const seen = new Set<string>();
  for (const scope of scopes) {
    for (const queryKey of SCOPE_KEYS[scope] ?? []) {
      const id = JSON.stringify(queryKey);
      if (seen.has(id)) continue;
      seen.add(id);
      void queryClient.invalidateQueries({ queryKey });
    }
  }
}

/** Wire main-process events to query invalidation and routing. Call once from the root route. */
export function subscribeAppEvents(
  queryClient: QueryClient,
  navigate: (to: string) => void,
): () => void {
  const offData = onAppEvent("data:changed", ({ scope }) => invalidateScopes(queryClient, scope));
  const offNavigate = onAppEvent("app:navigate", ({ to }) => navigate(to));
  const offBackup = onAppEvent("backup:auto-completed", () =>
    invalidateScopes(queryClient, ["backup"]),
  );
  // Kept in the cache for the Library's banner, which may not be on screen when a round runs.
  // Nothing can fetch it again, so it never expires.
  queryClient.setQueryDefaults(keys.updates.autoRun, { gcTime: Infinity });
  const offUpdates = onAppEvent("updates:auto-ran", (summary) => {
    queryClient.setQueryData(keys.updates.autoRun, summary);
    queryClient.setQueryData(keys.updates.lastAutoRun, summary.ranAt);
    invalidateScopes(queryClient, ["skills"]);
  });
  const offAppUpdate = onAppEvent("app-update:status", (status) =>
    queryClient.setQueryData(keys.app.update, status),
  );
  const offRepair = onAppEvent("deploy:repaired", (report) => {
    queryClient.setQueryData(keys.system.repair, report);
    if (report.repaired.length > 0) invalidateScopes(queryClient, ["skills"]);
  });
  return () => {
    offRepair();
    offAppUpdate();
    offData();
    offNavigate();
    offBackup();
    offUpdates();
  };
}
