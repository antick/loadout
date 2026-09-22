import { useBlocker } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

export interface LeaveGuardOptions {
  dirtyPaths: readonly string[];
  /** Save every unsaved file; false when one could not be saved, so the user stays. */
  saveAll(): Promise<boolean>;
  discardAll(): void;
}

export interface LeaveGuard {
  /** Navigation is on hold, waiting for the user's choice. */
  blocked: boolean;
  busy: boolean;
  saveAndLeave(): void;
  discardAndLeave(): void;
  stay(): void;
}

/**
 * Holds any navigation away from the editor while files are unsaved: sidebar, links, the
 * command palette and the tray all go through the router. Switching files is not leaving.
 * Closing the window is covered by the drafts kept in localStorage.
 */
export function useLeaveGuard({ dirtyPaths, saveAll, discardAll }: LeaveGuardOptions): LeaveGuard {
  const [busy, setBusy] = useState(false);
  const hasUnsaved = useRef(dirtyPaths.length > 0);
  useEffect(() => {
    hasUnsaved.current = dirtyPaths.length > 0;
  });

  const blocker = useBlocker({
    shouldBlockFn: ({ current, next }) => hasUnsaved.current && current.pathname !== next.pathname,
    enableBeforeUnload: false,
    withResolver: true,
  });
  const blocked = blocker.status === "blocked";

  return {
    blocked,
    busy,
    saveAndLeave: () => {
      if (blocker.status !== "blocked") return;
      const { proceed, reset } = blocker;
      setBusy(true);
      void saveAll()
        .then((saved) => (saved ? proceed() : reset()))
        .finally(() => setBusy(false));
    },
    discardAndLeave: () => {
      if (blocker.status !== "blocked") return;
      discardAll();
      hasUnsaved.current = false;
      blocker.proceed();
    },
    stay: () => {
      if (blocker.status === "blocked") blocker.reset();
    },
  };
}
