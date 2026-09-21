import { app, net } from "electron";
import { type AppUpdateInfo, isNewerVersion } from "@loadout/shared";
import { UPDATE_CHECK_TIMEOUT_MS, UPDATE_FEED_URL } from "./constants";

interface ReleaseFeed {
  version?: string;
  url?: string;
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
    hasUpdate: latestVersion !== null && isNewerVersion(latestVersion, currentVersion),
    currentVersion,
    latestVersion,
    releaseUrl: feed.url ?? null,
    configured: true,
  };
}
