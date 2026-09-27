import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SecretFinding, SecretKind } from "@loadout/shared";
import { AppError } from "../errors";
import { INTERNAL_KEYS } from "../settings/store";
import { statOrNull } from "../util/fs";
import type { BackupEnv } from "./env";
import { resolveCommit, upstreamRef } from "./repo";

/**
 * The check before a backup pushes: the files it would send (changed since the remote's last
 * state, or everything on a first push) are searched for well-known key and token formats. Only
 * formats with a distinctive shape are matched, so a skill that merely talks about keys passes.
 */

/** Git's id of the empty tree: the base when the remote has nothing of ours yet. */
const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
/** Larger files are not text a skill carries by hand; reading them would only cost time. */
const MAX_SCANNED_BYTES = 1024 * 1024;
/** Characters of a match shown on each side of the hidden middle. */
const MASK_KEEP = 4;
const ID_LENGTH = 16;
/** Documentation examples (AWS's `AKIAIOSFODNN7EXAMPLE`, `sk-xxxx…`) are not secrets. */
const PLACEHOLDER = /example|x{6,}|\*{4,}/i;

const PATTERNS: readonly { kind: SecretKind; regex: RegExp }[] = [
  { kind: "private_key", regex: /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----/g },
  { kind: "aws_key", regex: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { kind: "github_token", regex: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,})/g },
  { kind: "anthropic_key", regex: /\bsk-ant-[A-Za-z0-9_-]{20,}/g },
  { kind: "openai_key", regex: /\bsk-(?!ant-)(?:proj-|svcacct-)?[A-Za-z0-9_-]{32,}/g },
  { kind: "slack_token", regex: /\bxox[abposr]-[A-Za-z0-9-]{10,}/g },
  { kind: "google_key", regex: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { kind: "stripe_key", regex: /\b[rs]k_live_[0-9A-Za-z]{24,}/g },
  { kind: "npm_token", regex: /\bnpm_[A-Za-z0-9]{36}\b/g },
  { kind: "huggingface_token", regex: /\bhf_[A-Za-z0-9]{34,}\b/g },
];

function mask(match: string): string {
  if (match.length <= MASK_KEEP * 2) return "•".repeat(match.length);
  return `${match.slice(0, MASK_KEEP)}…${match.slice(-MASK_KEEP)}`;
}

function findingId(file: string, match: string): string {
  return createHash("sha256").update(`${file}\0${match}`).digest("hex").slice(0, ID_LENGTH);
}

/** Every match in one file's text, one per distinct secret per line. */
export function findSecrets(file: string, path: string, text: string): SecretFinding[] {
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
          id: findingId(file, value),
          file,
          path,
          line: index + 1,
          kind,
          masked: mask(value),
        });
      }
    }
  });
  return findings;
}

/**
 * Repository-relative files the next push would send: tracked files that differ from the remote's
 * state (committed or not), plus new files git does not ignore.
 */
async function filesToPush(env: BackupEnv, branch: string): Promise<string[]> {
  const upstream = await resolveCommit(env, `refs/remotes/${upstreamRef(branch)}`);
  const changed = await env.git.probe([
    "diff",
    "-z",
    "--name-only",
    "--no-renames",
    "--diff-filter=AMT",
    upstream ?? EMPTY_TREE,
  ]);
  const untracked = await env.git.probe(["ls-files", "-z", "--others", "--exclude-standard"]);
  const names = [changed, untracked].flatMap((result) =>
    result.code === 0 ? result.stdout.split("\0").filter(Boolean) : [],
  );
  return [...new Set(names)];
}

/** Findings in what the next push would send, minus the ones the user allowed. */
export async function scanForPush(env: BackupEnv, branch: string): Promise<SecretFinding[]> {
  const allowed = new Set(
    env.ctx.settings.getRaw<string[]>(INTERNAL_KEYS.backupAllowedSecrets, []),
  );
  const findings: SecretFinding[] = [];
  for (const file of await filesToPush(env, branch)) {
    // The app's own metadata holds no user text worth checking.
    if (file.startsWith(`${env.metadataName}/`)) continue;
    const path = join(env.repoDir, ...file.split("/"));
    const stat = statOrNull(path);
    if (!stat?.isFile() || stat.size > MAX_SCANNED_BYTES) continue;
    const bytes = readFileSync(path);
    if (bytes.includes(0)) continue;
    findings.push(...findSecrets(file, path, bytes.toString("utf8")));
  }
  return findings.filter((finding) => !allowed.has(finding.id));
}

/** Stop the push with the findings, worded so the status line alone says what to do. */
export function secretsFound(findings: SecretFinding[]): AppError {
  const [first] = findings;
  const where = first ? `${first.file}, line ${first.line}` : "";
  const more = findings.length > 1 ? ` and ${findings.length - 1} more` : "";
  return new AppError(
    "SECRETS_FOUND",
    `Backup held back: ${where}${more} looks like a key or token. Remove it, or choose Back up anyway on the Backup page.`,
    { secrets: findings },
  );
}

/** "Back up anyway" for these findings; kept on this computer only. */
export function allowSecrets(env: BackupEnv, ids: readonly string[]): void {
  const current = env.ctx.settings.getRaw<string[]>(INTERNAL_KEYS.backupAllowedSecrets, []);
  env.ctx.settings.setRaw(INTERNAL_KEYS.backupAllowedSecrets, [...new Set([...current, ...ids])]);
}
