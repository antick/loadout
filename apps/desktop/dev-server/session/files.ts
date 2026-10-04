import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Files } from "./fixtures-skills.ts";
import type { World } from "./world.ts";

/** Fixture commits carry one author and date, so their revisions are the same on every run. */
const FIXTURE_GIT_ENV = {
  GIT_AUTHOR_NAME: "Acme",
  GIT_AUTHOR_EMAIL: "dev@example.com",
  GIT_AUTHOR_DATE: "2026-09-01T09:00:00Z",
  GIT_COMMITTER_NAME: "Acme",
  GIT_COMMITTER_EMAIL: "dev@example.com",
  GIT_COMMITTER_DATE: "2026-09-01T09:00:00Z",
};
const BRANCH = "main";

/** Write each file under `dir`; a null entry removes that file or folder. */
export function writeFiles(dir: string, files: Record<string, string | null>): void {
  for (const [path, text] of Object.entries(files)) {
    const target = join(dir, path);
    if (text === null) {
      rmSync(target, { recursive: true, force: true });
      continue;
    }
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, text);
  }
}

/** The same files, each under `prefix/`. */
export function under(prefix: string, files: Files): Files {
  return Object.fromEntries(
    Object.entries(files).map(([path, text]) => [`${prefix}/${path}`, text]),
  );
}

export function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...FIXTURE_GIT_ENV },
  }).trim();
}

/** Where the bare repository for an `https://<host>/<path>` address lives in the world. */
export function remotePath(world: World, url: string): string {
  const { host, pathname } = new URL(url);
  const path = pathname.replace(/\.git$/, "");
  return join(world.remotes, host, `${path}.git`);
}

/** An empty bare repository in `dir`, unless one is there already. Returns `dir`. */
export function initBare(dir: string): string {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    git(dir, ["init", "--quiet", "--bare", `--initial-branch=${BRANCH}`]);
  }
  return dir;
}

/** The bare repository behind `url`, created empty when new. Returns its folder. */
export function createRepository(world: World, url: string): string {
  return initBare(remotePath(world, url));
}

/**
 * Commit files to the repository at `url` (created bare when new) on its main branch, the way its
 * owner would push. Returns the new revision.
 */
export function pushFiles(
  world: World,
  url: string,
  files: Record<string, string | null>,
  message: string,
): string {
  const bare = createRepository(world, url);
  const work = join(world.live, "tmp", "fixture-push");
  rmSync(work, { recursive: true, force: true });
  git(world.live, ["clone", "--quiet", bare, work]);
  git(work, ["checkout", "--quiet", "-B", BRANCH]);
  writeFiles(work, files);
  git(work, ["add", "--all"]);
  git(work, ["commit", "--quiet", "--allow-empty", "-m", message]);
  git(work, ["push", "--quiet", "origin", `HEAD:${BRANCH}`]);
  const revision = git(work, ["rev-parse", "HEAD"]);
  rmSync(work, { recursive: true, force: true });
  return revision;
}
