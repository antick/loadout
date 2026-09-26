import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AppUpdateStatus } from "@loadout/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type UpdateServiceDeps, createUpdateService } from "./service";

const FEED_URL = "https://example.test/releases/latest/download/latest.json";
const PACKAGE_URL = "https://example.test/releases/download/v1.1.0/loadout_1.1.0_amd64.deb";
const PACKAGE = Buffer.from("new package bytes");

let root: string;

/** The test's own release key: the feed it serves is signed with it. */
const RELEASE_KEY = generateKeyPairSync("ed25519");
const PUBLIC_KEY = RELEASE_KEY.publicKey.export({ type: "spki", format: "der" }).toString("base64");
const signFeed = (text: string, key = RELEASE_KEY.privateKey): string =>
  sign(null, Buffer.from(text), key).toString("base64");

function feed(overrides: Record<string, unknown> = {}) {
  return {
    version: "1.1.0",
    releaseUrl: "https://example.test/releases/tag/v1.1.0",
    files: {
      "linux-x64-deb": {
        name: "loadout_1.1.0_amd64.deb",
        url: PACKAGE_URL,
        sha256: createHash("sha256").update(PACKAGE).digest("hex"),
        size: PACKAGE.length,
      },
    },
    ...overrides,
  };
}

/**
 * A fetch that serves the feed, its signature and the package, or a status for the feed.
 * `signature` null serves none; by default the feed is signed with the test's release key.
 */
function fakeFetch(
  feedBody: unknown,
  feedStatus = 200,
  packageBytes = PACKAGE,
  signature: string | null = signFeed(JSON.stringify(feedBody)),
): typeof fetch {
  return (async (input: string) => {
    if (input === FEED_URL) {
      return new Response(JSON.stringify(feedBody), { status: feedStatus });
    }
    if (input === `${FEED_URL}.sig` && signature !== null) return new Response(signature);
    if (input === PACKAGE_URL) return new Response(packageBytes);
    return new Response("missing", { status: 404 });
  }) as typeof fetch;
}

function service(overrides: Partial<UpdateServiceDeps> = {}) {
  const events: AppUpdateStatus[] = [];
  const deps: UpdateServiceDeps = {
    currentVersion: "1.0.0",
    platform: "linux",
    arch: "x64",
    location: { method: "package", target: null, blocker: null },
    feedUrl: FEED_URL,
    feedPublicKey: PUBLIC_KEY,
    updatesDir: join(root, "updates"),
    logsDir: join(root, "logs"),
    fetchImpl: fakeFetch(feed()),
    emit: (status) => events.push(status),
    quit: vi.fn(),
    openPath: vi.fn(async () => ""),
    log: { info: vi.fn(), warn: vi.fn() },
    ...overrides,
  };
  return { updates: createUpdateService(deps), deps, events };
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "loadout-updates-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("update service", () => {
  it("finds a newer version and says when there is none", async () => {
    const { updates } = service();
    expect((await updates.check()).phase).toBe("available");
    expect(updates.status().latestVersion).toBe("1.1.0");

    const same = service({ fetchImpl: fakeFetch(feed({ version: "1.0.0" })) });
    expect((await same.updates.check()).phase).toBe("up_to_date");
  });

  it("ignores a feed that is unsigned, signed by another key, or changed after signing", async () => {
    const other = generateKeyPairSync("ed25519").privateKey;
    const body = feed();
    for (const fetchImpl of [
      fakeFetch(body, 200, PACKAGE, null),
      fakeFetch(body, 200, PACKAGE, signFeed(JSON.stringify(body), other)),
      fakeFetch(body, 200, PACKAGE, signFeed(JSON.stringify({ ...body, version: "9.9.9" }))),
    ]) {
      const status = await service({ fetchImpl }).updates.check();
      expect(status).toMatchObject({ phase: "error" });
      expect(status.error).toContain("not signed by Loadout's release key");
    }
  });

  it("reads an unsigned test feed only when no release key is required", async () => {
    const fetchImpl = fakeFetch(feed(), 200, PACKAGE, null);
    const status = await service({ fetchImpl, feedPublicKey: null }).updates.check();
    expect(status).toMatchObject({ phase: "available", latestVersion: "1.1.0" });
  });

  it("treats a missing feed (nothing published yet) as up to date", async () => {
    const { updates } = service({ fetchImpl: fakeFetch({}, 404) });
    const status = await updates.check();
    expect(status.phase).toBe("up_to_date");
    expect(status.latestVersion).toBeNull();
  });

  it("reports a release without a build for this system", async () => {
    const { updates } = service({ fetchImpl: fakeFetch(feed({ files: {} })) });
    const status = await updates.check();
    expect(status).toMatchObject({ phase: "available", blocker: "no_build" });
    expect((await updates.download()).phase).toBe("available");
  });

  it("downloads, verifies and opens the package in the system installer", async () => {
    const { updates, deps } = service();
    const status = await updates.download();
    expect(status.phase).toBe("ready");
    const saved = join(root, "updates", "1.1.0", "loadout_1.1.0_amd64.deb");
    expect(readFileSync(saved)).toEqual(PACKAGE);
    await updates.install();
    expect(deps.openPath).toHaveBeenCalledWith(saved);
    expect(deps.quit).not.toHaveBeenCalled();
  });

  it("refuses a download that does not match the checksum", async () => {
    const { updates } = service({
      fetchImpl: fakeFetch(feed(), 200, Buffer.from("tampered bytes!!!")),
    });
    const status = await updates.download();
    expect(status.phase).toBe("error");
    expect(status.error).toMatch(/checksum/);
    const saved = join(root, "updates", "1.1.0", "loadout_1.1.0_amd64.deb");
    expect(existsSync(saved)).toBe(false);
    expect(existsSync(`${saved}.part`)).toBe(false);
  });

  it("keeps a finished download across restarts and clears older ones", async () => {
    await service().updates.download();
    mkdirSync(join(root, "updates", "0.9.0"));

    const next = service();
    await next.updates.start();
    expect(next.updates.status()).toMatchObject({ phase: "ready", latestVersion: "1.1.0" });
    expect(existsSync(join(root, "updates", "0.9.0"))).toBe(false);

    // Once running 1.1.0, the download is old news.
    const updated = service({ currentVersion: "1.1.0" });
    await updated.updates.start();
    expect(updated.updates.status().phase).toBe("idle");
    expect(existsSync(join(root, "updates", "1.1.0"))).toBe(false);
  });

  it("reports once whether the last install arrived", async () => {
    mkdirSync(join(root, "updates"));
    const pending = join(root, "updates", "pending-install.json");
    writeFileSync(pending, JSON.stringify({ from: "1.0.0", to: "1.1.0", at: 1 }));
    const arrived = service({ currentVersion: "1.1.0" });
    await arrived.updates.start();
    expect(arrived.updates.status().lastInstall).toEqual({ version: "1.1.0", ok: true, at: 1 });
    expect(existsSync(pending)).toBe(false);

    writeFileSync(pending, JSON.stringify({ from: "1.0.0", to: "1.1.0", at: 2 }));
    const failed = service({ currentVersion: "1.0.0" });
    await failed.updates.start();
    expect(failed.updates.status().lastInstall).toEqual({ version: "1.1.0", ok: false, at: 2 });
  });

  it("does nothing without a feed", async () => {
    const { updates } = service({ feedUrl: null });
    expect(updates.status().blocker).toBe("not_configured");
    expect((await updates.check()).phase).toBe("idle");
  });
});
