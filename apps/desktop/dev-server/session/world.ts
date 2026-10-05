import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { cp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type SecretStore, createFileSecretStore } from "@loadout/core";
import {
  GIT_FIXTURE_CONFIG,
  gitRewriteConfig,
} from "../../../../packages/core/test/git-fixtures.ts";

/**
 * One session's temporary world. Everything it changes lives under `live`, at the same path for
 * the whole session, so a copy of it (`snapshot`) can be put back as it was: the seed, restored
 * between UI tests in a few milliseconds instead of seeded again.
 */
export interface World {
  root: string;
  live: string;
  /** The fake home folder: agents' folders, projects, the library at `~/.loadout`. */
  home: string;
  /** Bare Git repositories standing in for github.com and example.com. */
  remotes: string;
  secretsFile: string;
}

/** Hosts whose Git addresses go to `remotes/<host>/` instead of the network. */
const GIT_HOSTS = ["github.com", "example.com"];

export function createWorld(session: string): World {
  const root = realpathSync(mkdtempSync(join(tmpdir(), `loadout-${session}-`)));
  const live = join(root, "live");
  const world: World = {
    root,
    live,
    home: join(live, "home"),
    remotes: join(live, "remotes"),
    secretsFile: join(live, "secrets.json"),
  };
  emptyLive(world);
  isolateProcess(world);
  return world;
}

const gitConfigPath = (world: World): string => join(world.live, "gitconfig");

/** `live` as a new world has it: empty home, remotes and temp folders, and the Git config. */
export function emptyLive(world: World): void {
  rmSync(world.live, { recursive: true, force: true });
  for (const dir of [world.home, world.remotes, join(world.live, "tmp")]) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(
    gitConfigPath(world),
    GIT_FIXTURE_CONFIG + gitRewriteConfig(world.remotes, GIT_HOSTS),
  );
}

/** Git, temp files and the home folder of this process all point into the world. */
function isolateProcess(world: World): void {
  Object.assign(process.env, {
    HOME: world.home,
    GIT_CONFIG_GLOBAL: gitConfigPath(world),
    GIT_CONFIG_NOSYSTEM: "1",
    TMPDIR: join(world.live, "tmp"),
  });
}

export interface Snapshots {
  /** Keep `live` as it is now: what `restore` puts back. Core must be closed. */
  take(): void;
  /** Put the kept state back in place of `live`. Core must be closed. */
  restore(): Promise<void>;
}

const COPY = { recursive: true, verbatimSymlinks: true } as const;

/**
 * A spare copy of the kept state is made ahead of time, so putting it back is two renames; the
 * old `live` is removed and the next spare copied after that, while the next test runs.
 */
export function createSnapshots(world: World): Snapshots {
  const kept = join(world.root, "snapshot");
  const spareDir = join(world.root, "spare");
  let spare: Promise<void> = Promise.resolve();
  let discarded = 0;
  const prepare = (): Promise<void> =>
    rm(spareDir, { recursive: true, force: true }).then(() => cp(kept, spareDir, COPY));
  return {
    take: () => {
      rmSync(kept, { recursive: true, force: true });
      cpSync(world.live, kept, COPY);
      spare = prepare();
    },
    restore: async () => {
      await spare;
      discarded += 1;
      const old = join(world.root, `discarded-${discarded}`);
      renameSync(world.live, old);
      renameSync(spareDir, world.live);
      spare = Promise.all([rm(old, { recursive: true, force: true }), prepare()]).then(
        () => undefined,
      );
    },
  };
}

export function removeWorld(world: World): void {
  rmSync(world.root, { recursive: true, force: true });
}

/** Credentials in a file of the world, so they come back with the seed like everything else. */
export function fileSecrets(world: World): SecretStore {
  return createFileSecretStore(world.secretsFile);
}
