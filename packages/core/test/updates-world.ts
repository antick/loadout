import { join } from "node:path";
import type { Skill } from "@loadout/shared";
import type { GitClient, InstallServiceDeps } from "../src/install";
import { type UpdatesService, createUpdatesService } from "../src/updates";
import { type DeployWorld, createDeployWorld } from "./deploy-world";
import { makeSkill } from "./helpers";
import {
  type InstallHarness,
  commitAll,
  createInstallHarness,
  initRepo,
  isolateTmpDir,
  redirectGithubTo,
} from "./install-fixtures";

/** `owner/repo` the fixture repository stands in for on the marketplace. */
export const MARKET_SOURCE = "acme/skills";

export interface UpdatesWorld extends DeployWorld {
  install: InstallHarness;
  updates: UpdatesService;
  /** Private temp folder; leftover checkouts show up here. */
  tmp: string;
  /** Local repository with `skills/pdf` and `skills/docx`. */
  remote: string;
  /** How often the remote was asked for its revision. */
  lookups(): number;
  installFromGit(relPath: string): Promise<Skill>;
  /** Build a second service over the same world with some git calls replaced. */
  withGit(overrides: Partial<GitClient>): UpdatesService;
  claudeTarget(dirName: string): string;
  restore(): void;
}

/**
 * Deploy + install + updates wired as `createCore` wires them, over a local fixture repository.
 * `installDeps` reaches the install service, e.g. a fake `fetchImpl` for downloads.
 */
export function createUpdatesWorld(installDeps: Partial<InstallServiceDeps> = {}): UpdatesWorld {
  const world = createDeployWorld();
  world.installAgents(".claude");
  const tmp = join(world.root, "tmp");
  const remotes = join(world.root, "remotes");
  const restores = [isolateTmpDir(tmp), redirectGithubTo(remotes)];
  const install = createInstallHarness(world, installDeps);

  let lookupCount = 0;
  const countingGit: GitClient = {
    ...install.git,
    lsRemote: (url, options) => {
      lookupCount += 1;
      return install.git.lsRemote(url, options);
    },
  };
  const serviceWith = (git: GitClient): UpdatesService =>
    createUpdatesService(world.ctx, {
      store: world.store,
      install: { ...install, git },
      deploy: world.deploy,
    });

  const remote = initRepo(join(remotes, "acme", "skills.git"));
  makeSkill(join(remote, "skills"), "pdf", {
    files: { "scripts/run.sh": "echo pdf\n", "notes/old.md": "old notes\n" },
  });
  makeSkill(join(remote, "skills"), "docx");
  commitAll(remote, "initial");

  return {
    ...world,
    install,
    updates: serviceWith(countingGit),
    tmp,
    remote,
    lookups: () => lookupCount,
    installFromGit: async (relPath) => {
      const preview = await install.api.previewGit(remote);
      const [skill] = await install.api.confirmGit(preview.previewId, [{ relPath, name: "" }]);
      if (!skill) throw new Error(`Fixture skill not installed: ${relPath}`);
      return skill;
    },
    withGit: (overrides) => serviceWith({ ...countingGit, ...overrides }),
    claudeTarget: (dirName) => join(world.home, ".claude", "skills", dirName),
    restore: () => {
      for (const restore of restores) restore();
      world.cleanup();
    },
  };
}
