import { useCallback, useState } from "react";

export interface PendingSet {
  /** Keys with work running, e.g. agents whose switch is busy. */
  pending: ReadonlySet<string>;
  mark(key: string, on: boolean): void;
}

/** Which of several keys have work running, so each can show its own spinner. */
export function usePendingSet(): PendingSet {
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const mark = useCallback((key: string, on: boolean) => {
    setPending((previous) => {
      const next = new Set(previous);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);
  return { pending, mark };
}
