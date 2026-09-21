import { app, net } from "electron";
import type { AppUpdateInfo } from "@loadout/shared";
import { UPDATE_CHECK_TIMEOUT_MS, UPDATE_FEED_URL } from "./constants";

interface ReleaseFeed {
  version?: string;
  url?: string;
}

function parseVersion(text: string): number[] {
  return text
    .replace(/^v/i, "")
    .split(/[.-]/)
    .map((part) => Number.parseInt(part, 10) || 0);
}

export function isNewer(candidate: string, current: string): boolean {
  const a = parseVersion(candidate);
  const b = parseVersion(current);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff > 0;
  }
  return false;
}

/** Checking only ever notifies. Nothing is downloaded or installed without the user asking. */
export async function checkForUpdate(): Promise<AppUpdateInfo> {
  const currentVersion = app.getVersion();
  if (!UPDATE_FEED_URL) {
    return {
      hasUpdate: false,
      currentVersion,
      latestVersion: null,
      releaseUrl: null,
      configured: false,
    };
  }
  // `net.fetch` follows the system proxy settings.
  const response = await net.fetch(UPDATE_FEED_URL, {
    signal: AbortSignal.timeout(UPDATE_CHECK_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Update check failed (${response.status})`);
  const feed = (await response.json()) as ReleaseFeed;
  const latestVersion = feed.version ?? null;
  return {
    hasUpdate: latestVersion !== null && isNewer(latestVersion, currentVersion),
    currentVersion,
    latestVersion,
    releaseUrl: feed.url ?? null,
    configured: true,
  };
}
