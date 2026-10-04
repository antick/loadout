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
