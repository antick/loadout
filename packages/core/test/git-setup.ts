import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach } from "vitest";
import { GIT_FIXTURE_CONFIG } from "./git-fixtures";

/**
 * Vitest setup file of core and cli (`setupFiles`). Every git process a test starts, the
 * product's own clones and commits included, reads this file as the global config and no system
 * config, so the developer's settings (signing, hooks, default branch, URL rewrites) never reach
 * a test and commits have a name on any computer. The identity is config, not GIT_AUTHOR_*
 * variables, which would outrank the names Loadout itself gives its commits.
 */
const GIT_CONFIG =
  ["[user]", "\tname = Loadout Test", "\temail = test@loadout.invalid", ""].join("\n") +
  GIT_FIXTURE_CONFIG;

const dir = mkdtempSync(join(tmpdir(), "loadout-git-"));
const config = join(dir, "gitconfig");

// Each test starts from the same config; a test may write its own into the file or point
// GIT_CONFIG_GLOBAL elsewhere.
beforeEach(() => {
  writeFileSync(config, GIT_CONFIG);
  process.env.GIT_CONFIG_GLOBAL = config;
  process.env.GIT_CONFIG_NOSYSTEM = "1";
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});
