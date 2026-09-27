import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SecretFinding } from "@loadout/shared";
import { AppError } from "../errors";
import { INTERNAL_KEYS } from "../settings/store";
import { statOrNull } from "../util/fs";
import { SECRET_PATTERNS as PATTERNS } from "../util/secret-patterns";
import type { BackupEnv } from "./env";
import { resolveCommit, upstreamRef } from "./repo";

/**
 * The check before a backup pushes: what it would send (its commits, and changes not committed
 * yet) is searched for well-known key and token formats. Only formats with a distinctive shape
 * are matched, so a skill that merely talks about keys passes.
 */

/** Larger files are not text a skill carries by hand; reading them would only cost time. */
const MAX_SCANNED_BYTES = 1024 * 1024;
/** Characters of a match shown on each side of the hidden middle. */
const MASK_KEEP = 4;
const ID_LENGTH = 16;
/** Documentation examples (AWS's `AKIAIOSFODNN7EXAMPLE`, `sk-xxxx…`) are not secrets. */
const PLACEHOLDER = /example|x{6,}|\*{4,}/i;
/** Regular files in git trees; links and submodules hold no text of ours. */
const FILE_MODES: ReadonlySet<string> = new Set(["100644", "100755"]);
/** One `--raw -z` record: modes, blob ids, status, then the path. */
const RAW_RECORD = /:(\d{6}) (\d{6}) ([0-9a-f]+) ([0-9a-f]+) ([A-Z])\d*\0([^\0]+)\0/g;

function mask(match: string): string {
  if (match.length <= MASK_KEEP * 2) return "•".repeat(match.length);
  return `${match.slice(0, MASK_KEEP)}…${match.slice(-MASK_KEEP)}`;
}

/** Stable for the same text in the same file. */
function findingId(file: string, match: string): string {
  return createHash("sha256").update(`${file}\0${match}`).digest("hex").slice(0, ID_LENGTH);
}

/** Lines a private key block may span; its `END` line closes it. */
const MAX_KEY_BLOCK_LINES = 200;

/** The whole key block from its `BEGIN` line, so allowing one key never allows another. */
function keyBlock(lines: readonly string[], start: number): string {
  const end = lines.findIndex((line, index) => index >= start && line.includes("-----END "));
  const last = end === -1 ? Math.min(lines.length, start + MAX_KEY_BLOCK_LINES) : end + 1;
  return lines.slice(start, last).join("\n");
}

/** Every match in one file's text, one per distinct secret per line. */
export function findSecrets(
  file: string,
  path: string,
  text: string,
  committed = false,
): SecretFinding[] {
  const findings: SecretFinding[] = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    const seen = new Set<string>();
    for (const { kind, regex } of PATTERNS) {
      for (const match of line.matchAll(regex)) {
        const value = match[0];
        if (seen.has(value) || PLACEHOLDER.test(value)) continue;
        seen.add(value);
        findings.push({
          id: findingId(file, kind === "private_key" ? keyBlock(lines, index) : value),
          file,
          path,
          line: index + 1,
          kind,
          masked: mask(value),
          committed,
        });
      }
    }
  });
  return findings;
}

/** A git call whose answer the check depends on: when git fails, nothing may be pushed. */
async function required(env: BackupEnv, args: string[]): Promise<string> {
  const result = await env.git.probe(args);
  if (result.code !== 0) {
    throw new AppError("GIT", `Could not check the backup for keys: git ${args[0]} failed.`);
  }
  return result.stdout;
}

/** Text of a readable, not-too-large, not-binary file or blob; null otherwise. */
function scannable(bytes: Buffer): string | null {
  if (bytes.length > MAX_SCANNED_BYTES || bytes.includes(0)) return null;
  return bytes.toString("utf8");
}

/**
 * Files in the commits a push would send (`upstream..HEAD`, or every commit on a first push),
 * read from git itself: a key that was committed and then deleted is still in those commits.
 */
async function scanCommitted(env: BackupEnv, branch: string): Promise<SecretFinding[]> {
  const upstream = await resolveCommit(env, `refs/remotes/${upstreamRef(branch)}`);
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
  const blobs = new Map<string, string>();
  for (const [, , mode, , blob, , file] of raw.matchAll(RAW_RECORD)) {
    if (!mode || !blob || !file || !FILE_MODES.has(mode)) continue;
    if (file.startsWith(`${env.metadataName}/`)) continue;
    blobs.set(`${blob}\0${file}`, blob);
  }
  const findings: SecretFinding[] = [];
  for (const [key, blob] of blobs) {
    const file = key.slice(blob.length + 1);
    const content = await env.git.probe(["cat-file", "blob", blob]);
    if (content.code !== 0) throw new AppError("GIT", `Could not read ${file} from the backup.`);
    const text = scannable(Buffer.from(content.stdout, "utf8"));
    if (text === null) continue;
    findings.push(...findSecrets(file, join(env.repoDir, ...file.split("/")), text, true));
  }
  return findings;
}

/** Files not committed yet: changed tracked files and new files git does not ignore. */
async function scanUncommitted(env: BackupEnv): Promise<SecretFinding[]> {
  const head = await resolveCommit(env, "HEAD");
  const changed = head
    ? await required(env, [
        "diff",
        "-z",
        "--name-only",
        "--no-renames",
        "--diff-filter=AMT",
        "HEAD",
      ])
    : "";
  const untracked = await required(env, ["ls-files", "-z", "--others", "--exclude-standard"]);
  const files = new Set([...changed.split("\0"), ...untracked.split("\0")].filter(Boolean));
  const findings: SecretFinding[] = [];
  for (const file of files) {
    if (file.startsWith(`${env.metadataName}/`)) continue;
    const path = join(env.repoDir, ...file.split("/"));
    const stat = statOrNull(path);
    if (!stat?.isFile() || stat.size > MAX_SCANNED_BYTES) continue;
    const text = scannable(readFileSync(path));
    if (text !== null) findings.push(...findSecrets(file, path, text));
  }
  return findings;
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
  const [first] = findings;
  const where = first ? `${first.file}, line ${first.line}` : "";
  const more = findings.length > 1 ? ` and ${findings.length - 1} more` : "";
  const what = first?.committed
    ? "It is already in this computer's backup history, so removing it now does not stop it being pushed. Choose Back up anyway on the Backup page if it is safe to share."
    : "Remove it, or choose Back up anyway on the Backup page.";
  return new AppError(
    "SECRETS_FOUND",
    `Backup held back: ${where}${more} looks like a key or token. ${what}`,
    { secrets: findings },
  );
}

/** "Back up anyway" for these findings; kept on this computer only. */
export function allowSecrets(env: BackupEnv, ids: readonly string[]): void {
  const current = env.ctx.settings.getRaw<string[]>(INTERNAL_KEYS.backupAllowedSecrets, []);
  env.ctx.settings.setRaw(INTERNAL_KEYS.backupAllowedSecrets, [...new Set([...current, ...ids])]);
}
