import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, posix } from "node:path";
import { APP_SLUG, type GitPreview, MAX_SKILL_FILE_BYTES, SKILL_FILE } from "@loadout/shared";
import type { CoreContext } from "../context";
import { AppError, cancelled, errorMessage, isAppError } from "../errors";
import { mapLimit } from "../util/async";
import { removePath } from "../util/fs";
import { trySanitizeSkillName } from "../util/names";
import { unpackArchive } from "./archive";
import { archiveLinkName } from "./archive-link";
import type { Task } from "./cancel";
import {
  type Download,
  type DownloadOptions,
  PERCENT_TOTAL,
  parseUrl,
  percentReporter,
} from "./download";
import type { FetchedFolder, FetchedPreviewOptions } from "./fetched-preview";
import { emitProgress } from "./preview-sessions";
import { downloadWatched, redirectRule } from "./redirects";
import {
  type WellKnownEntry,
  type WellKnownIndex,
  fetchWellKnownSkill,
  findWellKnownIndex,
} from "./well-known";

/**
 * Installs from the web without Git: an archive link, a lone `SKILL.md`, or a site that publishes
 * skills at a well-known address. All three are recorded as `url` skills, and checked for updates
 * by fetching them again (see `updates/source.ts`).
 */

export interface WebPreviewDeps {
  download: Download;
  previewFetched(task: Task, options: FetchedPreviewOptions): Promise<GitPreview>;
}

export interface WebPreviews {
  archiveLink(task: Task, link: string, wanted: readonly string[]): Promise<GitPreview>;
  skillFile(task: Task, link: string): Promise<GitPreview>;
  /** The index a site publishes, or null when it has none. */
  findSite(task: Task, url: string): Promise<WellKnownIndex | null>;
  site(
    task: Task,
    url: string,
    index: WellKnownIndex,
    wanted: readonly string[],
  ): Promise<GitPreview>;
}

const SITE_DIR_PREFIX = `${APP_SLUG}-site-`;
const FILE_DIR_PREFIX = `${APP_SLUG}-file-`;
const FALLBACK_SKILL_NAME = "skill";
/** Skills of one site downloaded at once. */
const SITE_CONCURRENCY = 4;

/** Folder name for a lone `SKILL.md`: the folder it sits in on the web, else `skill`. */
function skillFileFolderName(link: string): string {
  const path = parseUrl(link)?.pathname ?? "";
  let segments: string[] = [];
  try {
    segments = decodeURIComponent(path).split("/").filter(Boolean);
  } catch {
    // Not decodable: the fallback name is fine.
  }
  return trySanitizeSkillName(segments.at(-2) ?? "") ?? FALLBACK_SKILL_NAME;
}

/** Write a downloaded `SKILL.md` into a fresh temp folder of its own. */
export async function skillFileFolder(link: string, data: Buffer): Promise<FetchedFolder> {
  const parent = await mkdtemp(join(tmpdir(), FILE_DIR_PREFIX));
  const root = join(parent, skillFileFolderName(link));
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, SKILL_FILE), data);
  return { root, cleanup: () => removePath(parent).catch(() => undefined) };
}

export function createWebPreviews(ctx: CoreContext, deps: WebPreviewDeps): WebPreviews {
  const { download, previewFetched } = deps;

  const downloadProgress = (key: string): DownloadOptions["onProgress"] =>
    percentReporter((percent) =>
      emitProgress(ctx, key, "downloading", { current: percent, total: PERCENT_TOTAL }),
    );

  return {
    archiveLink: (task, link, wanted) =>
      previewFetched(task, {
        kind: "archive",
        shownAs: link,
        wanted,
        fetch: async (signal) => {
          emitProgress(ctx, task.key, "downloading");
          const { data, redirectedTo } = await downloadWatched(download, link, {
            signal,
            subject: "The archive",
            onProgress: downloadProgress(task.key),
          });
          if (signal.aborted) throw cancelled();
          return { ...(await unpackArchive(data, archiveLinkName(link))), redirectedTo };
        },
        record: (subpath) => ({
          sourceType: "url",
          sourceRef: link,
          sourceUrl: link,
          sourceSubpath: subpath,
          updateStatus: "up_to_date",
        }),
        installed: (skill) => skill.sourceType === "url" && skill.sourceRef === link,
      }),

    skillFile: (task, link) =>
      previewFetched(task, {
        kind: "file",
        shownAs: link,
        fetch: async (signal) => {
          emitProgress(ctx, task.key, "downloading");
          const { data, redirectedTo } = await downloadWatched(download, link, {
            signal,
            subject: "The file",
            maxBytes: MAX_SKILL_FILE_BYTES,
          });
          if (signal.aborted) throw cancelled();
          return { ...(await skillFileFolder(link, data)), redirectedTo };
        },
        record: () => ({
          sourceType: "url",
          sourceRef: link,
          sourceUrl: link,
          sourceSubpath: null,
          updateStatus: "up_to_date",
        }),
        installed: (skill) => skill.sourceType === "url" && skill.sourceRef === link,
      }),

    findSite: (task, url) => {
      emitProgress(ctx, task.key, "downloading");
      return findWellKnownIndex(download, url, task.signal);
    },

    site: (task, url, index, wanted) =>
      previewFetched(task, {
        kind: "site",
        shownAs: url.trim(),
        wanted,
        fetch: (signal) => fetchSite(download, index, signal, ctx, task.key),
        record: (subpath) => ({
          sourceType: "url",
          sourceRef: url.trim(),
          sourceUrl: index.indexUrl,
          // The index name finds the skill again, whatever its folder holds.
          sourceSubpath: subpath?.split("/")[0] ?? null,
          updateStatus: "up_to_date",
        }),
        installed: (skill) => skill.sourceType === "url" && skill.sourceUrl === index.indexUrl,
      }),
  };
}

/**
 * Download every skill of a site's index into one temp folder, one folder per index name. A skill
 * that fails to download is left out and logged; the preview lists what arrived.
 */
async function fetchSite(
  download: Download,
  index: WellKnownIndex,
  signal: AbortSignal,
  ctx: CoreContext,
  key: string,
): Promise<FetchedFolder> {
  const root = await mkdtemp(join(tmpdir(), SITE_DIR_PREFIX));
  const cleanup = (): Promise<void> => removePath(root).catch(() => undefined);
  let done = 0;
  const failures: string[] = [];
  // The skills' downloads keep to the rule the index was read under: one other site at most.
  const rule = redirectRule("install", index.redirectedTo);
  try {
    await mapLimit(index.entries, SITE_CONCURRENCY, async (entry: WellKnownEntry) => {
      try {
        await fetchWellKnownSkill(download, entry, join(root, entry.name), rule, signal);
      } catch (error) {
        if (isAppError(error, "CANCELLED") || signal.aborted) throw cancelled();
        failures.push(`${entry.name}: ${errorMessage(error)}`);
        await removePath(join(root, entry.name)).catch(() => undefined);
      } finally {
        done += 1;
        emitProgress(ctx, key, "downloading", {
          current: Math.round((done / index.entries.length) * PERCENT_TOTAL),
          total: PERCENT_TOTAL,
        });
      }
    });
    if (failures.length > 0) {
      ctx.log.warn(`Some skills of ${posix.dirname(index.indexUrl)} did not download`, failures);
    }
    if (failures.length === index.entries.length) {
      throw new AppError("NETWORK", `None of the skills could be downloaded. ${failures[0]}`);
    }
    // The user confirms another site the downloads moved to; updates then follow it there only.
    return { root, cleanup, redirectedTo: rule.otherHost() };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
