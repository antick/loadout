/**
 * Test files run at once in one package. On a developer's computer, about a third of the cores:
 * measured on 10 cores, three workers took 186s for core against 159s for five, so the rest stay
 * free for the person at the computer, and `pnpm test` runs the packages one after another
 * (scripts/test.mjs). Backup tests start git per step.
 *
 * On CI the runner does nothing else and has 3 or 4 cores, where a third rounds down to one
 * worker: there vitest picks its own default and the packages run side by side.
 */
export const TEST_MAX_WORKERS: string | undefined = process.env.CI ? undefined : "30%";

/**
 * How long one test, or one set-up, may take. Tests start real git and open real libraries on
 * disk; a Windows runner starts processes several times slower than macOS or Linux.
 */
export const TEST_TIMEOUT_MS = process.platform === "win32" ? 120_000 : 30_000;
