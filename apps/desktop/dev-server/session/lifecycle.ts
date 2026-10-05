/**
 * When the session answers: after its first seed, and after each reset. A reset puts the kept
 * seed back; when that fails, the session seeds afresh rather than refusing every later call.
 */
export interface LifecycleSteps {
  /** Build the seed from nothing and open core on it. */
  seed(): Promise<void>;
  /** Put the kept seed back and open core on it. */
  restore(): Promise<void>;
  /** Why the session is unusable, or why it had to seed again. */
  report(message: string, error: unknown): void;
}

export interface Lifecycle {
  /** Resolves once the session can answer; rejects when it never will. */
  ready(): Promise<void>;
  /** Back to the seed; the next `ready` waits for it. */
  reset(): Promise<void>;
}

export const SEED_FAILED = "The preview session could not seed";
export const RESTORE_FAILED = "The preview session could not restore its seed, so it seeds again";

export function createLifecycle(steps: LifecycleSteps): Lifecycle {
  const become = (next: Promise<void>): Promise<void> => {
    // Every call answers with this error too; reported once here so the terminal says why.
    next.catch((error: unknown) => steps.report(SEED_FAILED, error));
    return next;
  };
  let ready = become(steps.seed());
  return {
    ready: () => ready,
    reset: () => {
      ready = become(
        steps.restore().catch((error: unknown) => {
          steps.report(RESTORE_FAILED, error);
          return steps.seed();
        }),
      );
      return ready;
    },
  };
}
