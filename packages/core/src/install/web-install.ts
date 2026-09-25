import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, posix } from "node:path";
import { APP_SLUG, type GitPreview } from "@loadout/shared";
import type { CoreContext } from "../context";
import { AppError, cancelled, errorMessage, isAppError } from "../errors";
import { mapLimit } from "../util/async";
import { removePath } from "../util/fs";
import { trySanitizeSkillName } from "../util/names";
import { unpackArchive } from "./archive";
import { archiveLinkName } from "./archive-link";
import type { CancelRegistry } from "./cancel";
import { type Download, type DownloadOptions, percentReporter } from "./download";
import type { FetchedFolder, FetchedPreviewOptions } from "./fetched-preview";
import { emitProgress } from "./preview-sessions";
import { crossSiteHost } from "./redirects";
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
  cancels: CancelRegistry;
  previewFetched(options: FetchedPreviewOptions): Promise<GitPreview>;
}

export interface WebPreviews {
  archiveLink(key: string, link: string, wanted: readonly string[]): Promise<GitPreview>;
  skillFile(key: string, link: string): Promise<GitPreview>;
  /** The index a site publishes, or null when it has none. Cancellable under `key`. */
  findSite(key: string, url: string): Promise<WellKnownIndex | null>;
  site(
    key: string,
    url: string,
    index: WellKnownIndex,
    wanted: readonly string[],
  ): Promise<GitPreview>;
}

const PERCENT_TOTAL = 100;
const SITE_DIR_PREFIX = `${APP_SLUG}-site-`;
const FILE_DIR_PREFIX = `${APP_SLUG}-file-`;
const FALLBACK_SKILL_NAME = "skill";
const SKILL_FILE = "SKILL.md";
const MAX_SKILL_FILE_BYTES = 2 * 1024 * 1024;
/** Skills of one site downloaded at once. */
const SITE_CONCURRENCY = 4;

/** Folder name for a lone `SKILL.md`: the folder it sits in on the web, else `skill`. */
export function skillFileFolderName(link: string): string {
  let segments: string[] = [];
  try {
    segments = decodeURIComponent(new URL(link).pathname).split("/").filter(Boolean);
  } catch {
    // Not a readable URL: the fallback name is fine.
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

/** Download with every hop watched; says which other site, if any, the file finally came from. */
export async function downloadWatched(
  download: Download,
  link: string,
  options: DownloadOptions,
): Promise<{ data: Buffer; redirectedTo: string | null }> {
  let final = link;
  const data = await download(link, {
    ...options,
    onRedirect: (to) => {
      final = to;
    },
  });
  return { data, redirectedTo: crossSiteHost(link, final) };
}

export function createWebPreviews(ctx: CoreContext, deps: WebPreviewDeps): WebPreviews {
  const { download, cancels, previewFetched } = deps;

  const downloadProgress = (key: string): DownloadOptions["onProgress"] =>
    percentReporter((percent) =>
      emitProgress(ctx, key, "downloading", { current: percent, total: PERCENT_TOTAL }),
    );

  return {
    archiveLink: (key, link, wanted) =>
      previewFetched({
        key,
        kind: "archive",
        shownAs: link,
        wanted,
        fetch: async (signal) => {
          emitProgress(ctx, key, "downloading");
          const { data, redirectedTo } = await downloadWatched(download, link, {
            signal,
            subject: "The archive",
            onProgress: downloadProgress(key),
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

    skillFile: (key, link) =>
      previewFetched({
        key,
        kind: "file",
        shownAs: link,
        fetch: async (signal) => {
          emitProgress(ctx, key, "downloading");
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

    findSite: async (key, url) => {
      const handle = cancels.register(key);
      try {
        emitProgress(ctx, key, "downloading");
        return await findWellKnownIndex(download, url, handle.signal);
      } finally {
        handle.done();
      }
    },

    site: (key, url, index, wanted) =>
      previewFetched({
        key,
        kind: "site",
        shownAs: url.trim(),
        wanted,
        fetch: (signal) => fetchSite(download, index, signal, ctx, key),
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
  try {
    await mapLimit(index.entries, SITE_CONCURRENCY, async (entry: WellKnownEntry) => {
      try {
        await fetchWellKnownSkill(download, entry, join(root, entry.name), signal);
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
    return { root, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
