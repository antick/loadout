import { rmSync } from "node:fs";
import { join } from "node:path";
import type { Skill } from "@loadout/shared";
import type { GitClient } from "../src/install";
import type { InstallServiceDeps } from "../src/install/service";
import { type RemovedStore, createRemovedStore } from "../src/storage";
import { type UpdatesService, createUpdatesService } from "../src/updates";
import { type DeployWorld, createDeployWorld } from "./deploy-world";
import { makeSkill, writeFile } from "./helpers";
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
  /** Recently removed, where an update keeps the edited version it replaces. */
  removed: RemovedStore;
  updates: UpdatesService;
  /** Private temp folder; leftover checkouts show up here. */
  tmp: string;
  /** Local repository with `skills/pdf` and `skills/docx`. */
  remote: string;
  /** How often the remote was asked for its revision. */
  lookups(): number;
  /** Install the remote's skill of that name from a list of the whole repository. */
  installFromGit(name: string): Promise<Skill>;
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
  const removed = createRemovedStore(world.ctx, { store: world.store });
  const serviceWith = (git: GitClient): UpdatesService =>
    createUpdatesService(world.ctx, {
      store: world.store,
      install: { ...install, git },
      deploy: world.deploy,
      removed,
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
    removed,
    updates: serviceWith(countingGit),
    tmp,
    remote,
    lookups: () => lookupCount,
    installFromGit: async (name) => {
      const preview = await install.api.previewGit(remote);
      const relPath = preview.skills.find((skill) => skill.name === name)?.relPath ?? name;
      const [skill] = await install.api.confirmGit(preview.previewId, [{ relPath, name: "" }]);
      if (!skill) throw new Error(`Fixture skill not installed: ${name}`);
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

/** A path inside the remote's `skills/pdf`. */
export const pdfInRemote = (world: UpdatesWorld, ...parts: string[]): string =>
  join(world.remote, "skills", "pdf", ...parts);

/** Commit a new `scripts/run.sh` for pdf upstream; returns the commit. */
export function changePdfUpstream(world: UpdatesWorld, content = "echo pdf v2\n"): string {
  writeFile(pdfInRemote(world, "scripts", "run.sh"), content);
  return commitAll(world.remote, "pdf: new script");
}

/** Commit pdf without its `notes/` folder upstream; returns the commit. */
export function dropNotesUpstream(world: UpdatesWorld): string {
  rmSync(pdfInRemote(world, "notes"), { recursive: true });
  return commitAll(world.remote, "pdf: drop notes");
}
