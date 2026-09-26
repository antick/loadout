import type { FlaggedSkill } from "@loadout/shared";

/**
 * The question "install these flagged skills anyway?". Installs run outside React (see
 * `install-tasks.ts`), so the question lives here and `FlaggedInstallDialog` shows it.
 */

export interface FlaggedPrompt {
  flagged: readonly FlaggedSkill[];
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
export function askToInstallFlagged(flagged: readonly FlaggedSkill[]): Promise<boolean> {
  current?.answer(false);
  return new Promise((resolve) => {
    const prompt: FlaggedPrompt = {
      flagged,
      answer: (install) => {
        if (current === prompt) publish(null);
        resolve(install);
      },
    };
    publish(prompt);
  });
}
