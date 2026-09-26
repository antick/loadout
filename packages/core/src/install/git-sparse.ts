import { SKILL_MARKER_FILES } from "@loadout/shared";
import type { ExecResult } from "../util/exec";

/**
 * Which files of a cached clone are on disk. The cache is a partial clone: big files arrive only
 * when a checkout needs them (see `CLONE_FILTER`). A preview puts only every skill's `SKILL.md` on
 * disk; the folders the user picks follow when they are installed. Git older than 2.35 (no
 * `--no-cone`) or a server that ignores the filter simply ends up with every file, as before.
 */

export type RunGit = (
  args: string[],
  call: { cwd: string; network?: boolean; signal?: AbortSignal },
) => Promise<ExecResult>;

/** Only the skill documents, anywhere in the repository (gitignore-style: no slash, any depth). */
export const MANIFEST_PATTERNS: readonly string[] = [...SKILL_MARKER_FILES];

const GLOB_SPECIALS = /[\\*?[\]]/g;

/** `a/b c` → `/a/b c/`: that one folder and everything in it, anchored at the repository root. */
export function folderPattern(relativeDir: string): string {
  const posix = relativeDir
    .split(/[\\/]+/)
    .filter(Boolean)
    .join("/");
  return `/${posix.replace(GLOB_SPECIALS, "\\$&")}/`;
}

async function isSparse(run: RunGit, slot: string): Promise<boolean> {
  const result = await run(["config", "--get", "core.sparseCheckout"], { cwd: slot });
  return result.code === 0 && result.stdout.trim() === "true";
}

/** Back to every file. Works on a Git that has no `sparse-checkout` command too. */
async function disableSparse(run: RunGit, slot: string, signal?: AbortSignal): Promise<void> {
  const call = { cwd: slot, network: true, signal };
  if ((await run(["sparse-checkout", "disable"], call)).code === 0) return;
  await run(["config", "core.sparseCheckout", "false"], { cwd: slot });
}

/**
 * Put `patterns` on disk in `slot` (null: every file), fetching missing contents in one go.
 * Returns whether the working tree is partial, and the reset that filled it for the caller to
 * check. A pattern Git cannot apply falls back to every file: always correct, only slower.
 */
export async function applyWorkingTree(
  run: RunGit,
  slot: string,
  patterns: readonly string[] | null,
  signal?: AbortSignal,
): Promise<{ partial: boolean; failure: string | null; reset: ExecResult }> {
  let partial = false;
  let failure: string | null = null;
  if (patterns) {
    const set = await run(["sparse-checkout", "set", "--no-cone", ...patterns], {
      cwd: slot,
      network: true,
      signal,
    });
    partial = set.code === 0;
    if (!partial) failure = set.stderr.trim();
  }
  if (!partial && (await isSparse(run, slot))) await disableSparse(run, slot, signal);
  // Fills the tree after a `--no-checkout` clone and after the patterns changed.
  const reset = await run(["reset", "--hard", "HEAD"], { cwd: slot, network: true, signal });
  return { partial, failure, reset };
}
