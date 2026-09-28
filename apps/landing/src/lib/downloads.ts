import { UPDATE_FEED_URL, type UpdateTarget, parseUpdateFeed } from "@loadout/shared";

/**
 * Direct installer links, read at build time from the newest published release's `latest.json`
 * (the feed the app updates from), so every link points at a file that exists. Without the feed
 * the page falls back to the release page instead of failing the build.
 */

/** How long the build waits for GitHub before it falls back to the release page. */
const FETCH_TIMEOUT_MS = 10_000;
const MAC_DISK_IMAGE = ".dmg";
const MAC_ARCHIVE = ".zip";

export interface Download {
  /** What the button says, e.g. "Apple silicon". */
  label: string;
  /** The kind of file, e.g. ".dmg". */
  kind: string;
  url: string;
}

export interface DownloadGroup {
  system: string;
  downloads: Download[];
}

export interface Downloads {
  version: string;
  groups: DownloadGroup[];
}

/** Every build the page offers, in the order it lists them. */
const OFFERED: readonly { system: string; label: string; target: UpdateTarget }[] = [
  { system: "macOS", label: "Apple silicon", target: "darwin-arm64" },
  { system: "macOS", label: "Intel", target: "darwin-x64" },
  { system: "Windows", label: "64-bit", target: "win32-x64" },
  { system: "Linux", label: "x64", target: "linux-x64-appimage" },
  { system: "Linux", label: "x64", target: "linux-x64-deb" },
  { system: "Linux", label: "ARM", target: "linux-arm64-appimage" },
  { system: "Linux", label: "ARM", target: "linux-arm64-deb" },
];

const kindOf = (name: string): string => name.slice(name.lastIndexOf("."));

/** Whether GitHub has a release file there: a redirect to the download means yes. */
async function exists(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: "HEAD",
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    return response.status < 400;
  } catch {
    return false;
  }
}

/**
 * The feed lists the macOS `.zip` the app updates from. People installing for the first time want
 * the disk image built next to it under the same name (`artifactName` in electron-builder.yml);
 * the `.zip` stays the link when there is none.
 */
async function macDiskImage(download: Download): Promise<Download> {
  if (download.kind !== MAC_ARCHIVE) return download;
  const url = `${download.url.slice(0, -MAC_ARCHIVE.length)}${MAC_DISK_IMAGE}`;
  return (await exists(url)) ? { ...download, kind: MAC_DISK_IMAGE, url } : download;
}

/** The installers of the newest release, grouped by system; null when they cannot be read. */
export async function loadDownloads(): Promise<Downloads | null> {
  try {
    const response = await fetch(UPDATE_FEED_URL, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const feed = parseUpdateFeed(await response.json(), UPDATE_FEED_URL);

    const groups: DownloadGroup[] = [];
    for (const { system, label, target } of OFFERED) {
      const file = feed.files[target];
      if (!file) continue;
      const download = await macDiskImage({ label, kind: kindOf(file.name), url: file.url });
      const group = groups.find((entry) => entry.system === system);
      if (group) group.downloads.push(download);
      else groups.push({ system, downloads: [download] });
    }
    if (groups.length === 0) throw new Error("the feed lists no installers");
    return { version: feed.version, groups };
  } catch (error) {
    // Seen in the build log; the page links to the release page instead.
    console.warn(`Direct download links left out: ${String(error)}`);
    return null;
  }
}
