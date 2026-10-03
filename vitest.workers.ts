/**
 * Test files run at once in one package: about a third of the cores. Measured on 10 cores, three
 * workers took 186s for core against 159s for five, so the rest stay free for the person at the
 * computer. `pnpm test` also runs the packages one after another. Backup tests start git per step.
 */
export const TEST_MAX_WORKERS = "30%";
