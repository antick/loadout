import { join } from "node:path";
import type { SecretFinding } from "@loadout/shared";
import { AppError } from "../errors";
import { INTERNAL_KEYS } from "../settings/store";
import { statOrNull } from "../util/fs";
import type { BackupEnv } from "./env";
import { resolveCommit, upstreamCommit } from "./repo";
import { findSecrets, findSecretsInFile, secretsHeldBack } from "./secret-scan";

/**
 * The check before a backup pushes: what it would send (its commits, and changes not committed
 * yet) is searched for well-known key and token formats. Only formats with a distinctive shape
 * are matched, so a skill that merely talks about keys passes.
 */

/** Regular files in git trees; links and submodules hold no text of ours. */
const FILE_MODES: ReadonlySet<string> = new Set(["100644", "100755"]);
/** One `--raw -z` record: modes, blob ids, status, then the path. */
const RAW_RECORD = /:(\d{6}) (\d{6}) ([0-9a-f]+) ([0-9a-f]+) ([A-Z])\d*\0([^\0]+)\0/g;

/** A git call whose answer the check depends on: when git fails, nothing may be pushed. */
async function required(env: BackupEnv, args: string[]): Promise<string> {
  const result = await env.git.probe(args);
  if (result.code !== 0) {
    throw new AppError("GIT", `Could not check the backup for keys: git ${args[0]} failed.`);
  }
  return result.stdout;
}

/**
 * Files in the commits a push would send (`upstream..HEAD`, or every commit on a first push),
 * read from git itself: a key that was committed and then deleted is still in those commits.
 */
async function scanCommitted(env: BackupEnv, branch: string): Promise<SecretFinding[]> {
  const upstream = await upstreamCommit(env, branch);
  const head = await resolveCommit(env, "HEAD");
  if (!head) return [];
  const range = upstream ? `${upstream}..HEAD` : "HEAD";
  const raw = await required(env, [
    "log",
    "--raw",
    "-z",
    "--no-renames",
    "--no-abbrev",
    "--diff-filter=AMT",
    "--format=",
    range,
  ]);
  // Merge commits show no changes in that log: what a merge brings in, compared with our side,
  // is read separately.
  const merges = (await required(env, ["log", "--merges", "--format=%H", range]))
    .split("\n")
    .filter(Boolean);
  const mergeRaw: string[] = [];
  for (const merge of merges) {
    mergeRaw.push(
      await required(env, [
        "diff-tree",
        "-r",
        "-z",
        "--no-renames",
        "--no-abbrev",
        "--diff-filter=AMT",
        `${merge}^1`,
        merge,
      ]),
    );
  }
  // Whatever the remote already holds is on it already: pushing it again publishes nothing new,
  // and a key another computer allowed is never flagged here again.
  const onRemote = upstream ? await blobsOf(env, upstream) : new Set<string>();
  const blobs = new Map<string, string>();
  for (const text of [raw, ...mergeRaw]) {
    for (const [, , mode, , blob, , file] of text.matchAll(RAW_RECORD)) {
      if (!mode || !blob || !file || !FILE_MODES.has(mode) || onRemote.has(blob)) continue;
      blobs.set(`${blob}\0${file}`, blob);
    }
  }
  const findings: SecretFinding[] = [];
  for (const [key, blob] of blobs) {
    const file = key.slice(blob.length + 1);
    const content = await env.git.probe(["cat-file", "blob", blob]);
    if (content.code !== 0) throw new AppError("GIT", `Could not read ${file} from the backup.`);
    // Binary content is not text; anything else is searched whatever its size.
    if (content.stdout.includes("\0")) continue;
    findings.push(
      ...findSecrets(file, join(env.repoDir, ...file.split("/")), content.stdout, true),
    );
  }
  return findings;
}

/** Every file content (blob id) in a commit's tree. */
async function blobsOf(env: BackupEnv, commit: string): Promise<Set<string>> {
  const listing = await required(env, ["ls-tree", "-r", "-z", "--full-tree", commit]);
  const ids = new Set<string>();
  for (const entry of listing.split("\0")) {
    const id = entry.split("\t")[0]?.split(" ")[2];
    if (id) ids.add(id);
  }
  return ids;
}

/** Git's id of the empty tree: the base when the remote has nothing of ours yet. */
const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

/**
 * Files on disk that differ from `base` (a commit; null for "nothing yet"), plus new files git
 * does not ignore. With HEAD: what is not committed yet. With the remote's state: everything the
 * files would add to it.
 */
async function scanFilesSince(env: BackupEnv, base: string | null): Promise<SecretFinding[]> {
  const changed = await required(env, [
    "diff",
    "-z",
    "--name-only",
    "--no-renames",
    "--diff-filter=AMT",
    base ?? EMPTY_TREE,
  ]);
  const untracked = await required(env, ["ls-files", "-z", "--others", "--exclude-standard"]);
  const files = new Set([...changed.split("\0"), ...untracked.split("\0")].filter(Boolean));
  const findings: SecretFinding[] = [];
  // The metadata folder is checked too: it holds the user's own words (skill notes).
  for (const file of files) {
    const path = join(env.repoDir, ...file.split("/"));
    if (!statOrNull(path)?.isFile()) continue;
    findings.push(...(findSecretsInFile(file, path) ?? []));
  }
  return findings;
}

/** Files not committed yet: changed tracked files and new files git does not ignore. */
async function scanUncommitted(env: BackupEnv): Promise<SecretFinding[]> {
  return scanFilesSince(env, await resolveCommit(env, "HEAD"));
}

/** What today's files would add to the remote, committed or not, minus the allowed findings. */
export async function scanCurrentFiles(env: BackupEnv, branch: string): Promise<SecretFinding[]> {
  const upstream = await upstreamCommit(env, branch);
  return notAllowed(env, await scanFilesSince(env, upstream));
}

function notAllowed(env: BackupEnv, findings: SecretFinding[]): SecretFinding[] {
  const allowed = new Set(
    env.ctx.settings.getRaw<string[]>(INTERNAL_KEYS.backupAllowedSecrets, []),
  );
  const seen = new Set<string>();
  return findings.filter((finding) => {
    if (allowed.has(finding.id) || seen.has(finding.id)) return false;
    seen.add(finding.id);
    return true;
  });
}

/** Findings in changes that are not committed yet, minus the allowed ones. */
export async function scanUncommittedChanges(env: BackupEnv): Promise<SecretFinding[]> {
  return notAllowed(env, await scanUncommitted(env));
}

/**
 * Findings in everything the next push would send: its commits and what is not committed yet.
 * Uncommitted ones come first, since removing those still helps.
 */
export async function scanForPush(env: BackupEnv, branch: string): Promise<SecretFinding[]> {
  return notAllowed(env, [...(await scanUncommitted(env)), ...(await scanCommitted(env, branch))]);
}

/** Stop the push with the findings, worded so the status line alone says what to do. */
export function secretsFound(findings: SecretFinding[]): AppError {
  return secretsHeldBack(
    "Backup",
    findings,
    findings[0]?.committed
      ? "It is already in this computer's backup history, so removing it now does not stop it being pushed. Choose Back up anyway on the Backup page if it is safe to share."
      : "Remove it, or choose Back up anyway on the Backup page.",
  );
}

/** "Back up anyway" for these findings; kept on this computer only. */
export function allowSecrets(env: BackupEnv, ids: readonly string[]): void {
  const current = env.ctx.settings.getRaw<string[]>(INTERNAL_KEYS.backupAllowedSecrets, []);
  env.ctx.settings.setRaw(INTERNAL_KEYS.backupAllowedSecrets, [...new Set([...current, ...ids])]);
}
