import { afterEach, expect, it, vi } from "vitest";
import { RELEASES_URL, UPDATE_FEED_FILE } from "@loadout/shared";
import { loadDownloads } from "../../landing/src/lib/downloads";

const VERSION = "0.4.0";
const TAG = `v${VERSION}`;
const FEED = `${RELEASES_URL}/download/${TAG}/${UPDATE_FEED_FILE}`;
const FILES = Object.fromEntries(
  [
    ["darwin-arm64", "mac-arm64.zip"],
    ["darwin-x64", "mac-x64.zip"],
    ["linux-x64-appimage", "x64.AppImage"],
    ["linux-arm64-appimage", "arm64.AppImage"],
    ["linux-x64-deb", "x64.deb"],
    ["linux-arm64-deb", "arm64.deb"],
  ].map(([target, name]) => [
    target,
    {
      name,
      url: `${RELEASES_URL}/download/${TAG}/${name}`,
      sha256: "a".repeat(64),
      size: 123,
    },
  ]),
);

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function serve(version = VERSION, files = FILES, dmgStatus = 302) {
  vi.stubEnv("LOADOUT_RELEASE_TAG", TAG);
  const fetch = vi.fn(async (url: string) =>
    url === FEED ? Response.json({ version, files }) : new Response(null, { status: dmgStatus }),
  );
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

it("builds public links from the exact released tag and offers DMGs", async () => {
  const fetch = serve();
  const downloads = await loadDownloads();
  expect(fetch.mock.calls[0]?.[0]).toBe(FEED);
  expect(downloads?.version).toBe(VERSION);
  expect(downloads?.groups[0]?.downloads.every((file) => file.kind === ".dmg")).toBe(true);
  expect(downloads?.groups.flatMap((group) => group.downloads)).toHaveLength(6);
});

it("fails production deployment for a different version, missing target or missing DMG", async () => {
  serve("0.3.0");
  await expect(loadDownloads()).rejects.toThrow("does not match");
  serve(VERSION, {});
  await expect(loadDownloads()).rejects.toThrow("Missing installer");
  serve(VERSION, FILES, 404);
  await expect(loadDownloads()).rejects.toThrow("Missing disk image");
});

it("does not silently fall back when the pinned feed is unavailable", async () => {
  serve();
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  await expect(loadDownloads()).rejects.toThrow("offline");
});
