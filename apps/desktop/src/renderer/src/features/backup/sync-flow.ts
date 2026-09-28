import type { SyncOutcome } from "@loadout/shared";
import { createContext, useContext } from "react";

export interface SyncFlowCallbacks {
  onSuccess?(outcome: SyncOutcome): void;
  /** Called after the error was already shown to the user. */
  onError?(error: unknown): void;
}

/**
 * A manual sync: look at the remote first, and when it holds changes show the review before
 * anything happens. Every "sync now" button goes through this, so they all behave the same.
 */
export interface SyncFlow {
  start(callbacks?: SyncFlowCallbacks): void;
  /** Looking at the remote, or syncing. */
  busy: boolean;
}

export const SyncFlowContext = createContext<SyncFlow | null>(null);

export function useSyncFlow(): SyncFlow {
  const flow = useContext(SyncFlowContext);
  if (!flow) throw new Error("useSyncFlow must be used inside <SyncFlowProvider>.");
  return flow;
}
