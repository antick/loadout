import { randomBytes } from "node:crypto";
import { SNAPSHOT_TAG_PREFIX, type Snapshot, formatTimestampCompact } from "@loadout/shared";
import { invalid, notFound } from "../errors";
import { INTERNAL_KEYS } from "../settings/store";
import { assertReadable, schemaAt } from "./compat";
import type { BackupEnv } from "./env";
import { commitLibrary, commitStaged, resolveCommit } from "./repo";

/**
 * Snapshots are annotated tags: they carry the device name and a date of their own, and
 * `push --follow-tags` takes them along with the branch.
 */

export const DEFAULT_SNAPSHOT_LIMIT = 50;
const SNAPSHOT_SUFFIX_BYTES = 2;
const SHORT_COMMIT_LENGTH = 8;
const MS_PER_SECOND = 1000;
const FIELD_SEPARATOR = "\0";
const RECORD_SEPARATOR = "";
const BEFORE_RESTORE_MESSAGE = "backup: before restore";
const RESTORE_MESSAGE_PREFIX = "restore: ";
const TAG_FORMAT = [
  "%(refname:short)",
  "%(*objectname)",
  "%(objectname)",
  "%(contents:subject)",
  "%(creatordate:unix)",
  "%(taggername)",
  "%(authorname)",
].join("%00");

function newTagName(): string {
  const suffix = randomBytes(SNAPSHOT_SUFFIX_BYTES).toString("hex");
  return `${SNAPSHOT_TAG_PREFIX}${formatTimestampCompact(Date.now())}-${suffix}`;
}

/** The snapshot tag on the current commit, if it has one. */
export async function snapshotAtHead(env: BackupEnv): Promise<string | null> {
  const tags = await env.git.text([
    "tag",
    "--points-at",
    "HEAD",
    "--sort=-creatordate",
    "--list",
    `${SNAPSHOT_TAG_PREFIX}*`,
  ]);
  return tags.split(/\r?\n/).find(Boolean) ?? null;
}

/**
 * Tag the current commit. A commit that already has a snapshot keeps it, so a retried sync or a
 * safety point taken twice does not pile up tags for one state. Must run inside the library lock.
 */
export async function tagSnapshot(env: BackupEnv): Promise<string> {
  const existing = await snapshotAtHead(env);
  if (existing) return existing;
  const subject = await env.git.text(["log", "-1", "--format=%s"]);
  const tag = newTagName();
  await env.git.run(["tag", "-a", tag, "-m", subject || tag]);
  return tag;
}

export async function listSnapshots(
  env: BackupEnv,
  limit = DEFAULT_SNAPSHOT_LIMIT,
): Promise<Snapshot[]> {
  const output = await env.git.text([
    "for-each-ref",
    `--format=${TAG_FORMAT}%01`,
    `refs/tags/${SNAPSHOT_TAG_PREFIX}*`,
  ]);
  const snapshots: Snapshot[] = [];
  for (const record of output.split(RECORD_SEPARATOR)) {
    const [tag, peeled, object, message, created, tagger, author] = record
      .replace(/^\s+/, "")
      .split(FIELD_SEPARATOR);
    if (!tag) continue;
    snapshots.push({
      tag,
      commit: (peeled || object || "").slice(0, SHORT_COMMIT_LENGTH),
      message: message ?? "",
      createdAt: Number(created ?? 0) * MS_PER_SECOND,
      device: tagger || author || "",
    });
  }
  // Tag names start with a UTC timestamp, so they break ties between tags made in one second.
  snapshots.sort((a, b) => b.createdAt - a.createdAt || (a.tag < b.tag ? 1 : -1));
  return snapshots.slice(0, Math.max(1, limit));
}

/**
 * Put the library back to how it was at `tag`. History is never rewritten: the current state is
 * committed and tagged first (the returned safety snapshot), then a new commit carries the old
 * content forward. Must run inside the library lock.
 */
export async function restoreSnapshot(env: BackupEnv, tag: string): Promise<string> {
  if (!tag.startsWith(SNAPSHOT_TAG_PREFIX)) throw invalid(`"${tag}" is not a snapshot.`);
  if (!(await resolveCommit(env, `refs/tags/${tag}`))) throw notFound(`Snapshot not found: ${tag}`);
  assertReadable(await schemaAt(env, `refs/tags/${tag}`));

  await commitLibrary(env, BEFORE_RESTORE_MESSAGE);
  const safety = await tagSnapshot(env);
  try {
    // Makes the index and the folder match the snapshot exactly, deletions included,
    // without moving the branch.
    await env.git.run(["read-tree", "--reset", "-u", `refs/tags/${tag}`]);
    await commitStaged(env, `${RESTORE_MESSAGE_PREFIX}${tag}`);
  } catch (error) {
    await env.git.probe(["reset", "--hard", `refs/tags/${safety}`]);
    throw error;
  }
  env.ctx.settings.setRaw(INTERNAL_KEYS.backupRestoredFrom, tag);
  return safety;
}
