import {
  ApiError,
  type ErrorDetails,
  type FlaggedSkill,
  type UncheckedSkill,
} from "@loadout/shared";
import { toast } from "sonner";

/**
 * The question "install these flagged skills anyway?". Installs run outside React (see
 * `install-tasks.ts`), so the question lives here and `FlaggedInstallDialog` shows it.
 */

/** What the flagged skills were about to go through: a first install, or a new version. */
export type FlaggedAction = "install" | "update";

export interface FlaggedPrompt {
  flagged: readonly FlaggedSkill[];
  /** Skills the check could not finish on. */
  unchecked: readonly UncheckedSkill[];
  action: FlaggedAction;
  answer(install: boolean): void;
}

let current: FlaggedPrompt | null = null;
const subscribers = new Set<() => void>();

function publish(next: FlaggedPrompt | null): void {
  current = next;
  for (const notify of subscribers) notify();
}

export function subscribeFlaggedPrompt(notify: () => void): () => void {
  subscribers.add(notify);
  return () => subscribers.delete(notify);
}

export function getFlaggedPrompt(): FlaggedPrompt | null {
  return current;
}

/** Ask, and resolve with the answer. A newer question answers an open one with "no". */
export function askToInstallFlagged(
  details: ErrorDetails | undefined,
  action: FlaggedAction = "install",
): Promise<boolean> {
  const flagged = details?.flagged ?? [];
  const unchecked = details?.unchecked ?? [];
  current?.answer(false);
  return new Promise((resolve) => {
    const prompt: FlaggedPrompt = {
      flagged,
      unchecked,
      action,
      answer: (install) => {
        if (current === prompt) publish(null);
        resolve(install);
      },
    };
    publish(prompt);
  });
}

/** What `runWithRiskConsent` resolves to when the user would rather not go ahead. */
export const DECLINED: unique symbol = Symbol("declined");

export interface RiskConsentOptions {
  /** What the flagged skills were about to go through, for the question's wording. */
  action?: FlaggedAction;
  /** The toast when the user says no: what did not happen, and what stays as it was. */
  declined: string;
  /** Show the declined toast under this id, replacing a progress toast of the same id. */
  toastId?: string | number;
  /** Just before asking, e.g. to take a progress toast away. */
  onAsk?: () => void;
  /** After a yes, before running again, e.g. to show the progress toast again. */
  onAccept?: () => void;
}

/**
 * Run `run`. When the safety check stops it (UNSAFE), show the findings and ask; on a yes run
 * `runAcceptingRisk`, on a no toast `declined` and resolve with DECLINED. Other errors pass through.
 */
export async function runWithRiskConsent<T>(
  run: () => Promise<T>,
  runAcceptingRisk: () => Promise<T>,
  { action = "install", declined, toastId, onAsk, onAccept }: RiskConsentOptions,
): Promise<T | typeof DECLINED> {
  try {
    return await run();
  } catch (error) {
    if (!(error instanceof ApiError) || error.code !== "UNSAFE") throw error;
    onAsk?.();
    if (!(await askToInstallFlagged(error.details, action))) {
      toast.info(declined, toastId === undefined ? undefined : { id: toastId });
      return DECLINED;
    }
    onAccept?.();
    return runAcceptingRisk();
  }
}
