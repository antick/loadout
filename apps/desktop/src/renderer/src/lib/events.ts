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
 * project skill lists, project health counts, marketplace "installed" flags and the activity log.
 */
const SCOPE_KEYS: Record<DataScope, readonly QueryKey[]> = {
  skills: [
    keys.skills.root,
    keys.editor.root,
    keys.workspace.root,
    keys.projects.root,
    keys.updates.root,
    keys.market.root,
    keys.system.root,
    keys.storage.root,
  ],
  agents: [
    keys.agents.root,
    keys.workspace.root,
    keys.projects.root,
    keys.editor.root,
    keys.instructions.root,
  ],
  presets: [keys.presets.root, keys.skills.root],
  projects: [keys.projects.root, keys.editor.root, keys.instructions.root],
  backup: [keys.backup.root],
  settings: [keys.settings.root, keys.system.root],
};

/** Invalidate everything that depends on the given data scopes. */
export function invalidateScopes(queryClient: QueryClient, scopes: readonly DataScope[]): void {
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
    invalidateScopes(queryClient, ["backup", "settings"]),
  );
  const offUpdates = onAppEvent("updates:auto-ran", () =>
    invalidateScopes(queryClient, ["skills", "settings"]),
  );
  return () => {
    offData();
    offNavigate();
    offBackup();
    offUpdates();
  };
}
