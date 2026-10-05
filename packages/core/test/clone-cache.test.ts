import { existsSync, mkdirSync, utimesSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type CloneCache, createCloneCache } from "../src/install/clone-cache";
import { tempDir } from "./helpers";

const URL_A = "https://github.com/acme/a";
const URL_B = "https://github.com/acme/b";
const SHORT_WAIT_MS = 200;

/** A lock file as a running process (this test's parent) writes it. */
function heldByOtherProcess(slot: string): void {
  const info = { pid: process.ppid, host: hostname(), operation: "checkout", startedAt: 1 };
  writeFileSync(`${slot}.lock`, JSON.stringify(info));
}

/** A cache slot holding one small file. */
function slotWithFile(cache: CloneCache, url: string): string {
  const slot = cache.slotFor(url);
  mkdirSync(slot);
  writeFileSync(join(slot, "file"), "x".repeat(100));
  return slot;
}

describe("the clone cache across processes", () => {
  let temp: ReturnType<typeof tempDir>;
  let reposDir: string;
  beforeEach(() => {
    temp = tempDir();
    reposDir = join(temp.dir, "repos");
    mkdirSync(reposDir);
  });
  afterEach(() => temp.cleanup());

  it("waits for a slot another process uses, and gives up after the wait", async () => {
    const cache = createCloneCache(reposDir, Number.MAX_SAFE_INTEGER, SHORT_WAIT_MS);
    const slot = slotWithFile(cache, URL_A);
    heldByOtherProcess(slot);
    let ran = false;
    await expect(
      cache.withSlot(slot, async () => {
        ran = true;
      }),
    ).rejects.toMatchObject({ code: "BUSY" });
    expect(ran).toBe(false);
  });

  it("takes a slot whose lock a process that is gone left behind", async () => {
    const cache = createCloneCache(reposDir, Number.MAX_SAFE_INTEGER, SHORT_WAIT_MS);
    const slot = slotWithFile(cache, URL_A);
    const gone = { pid: 2 ** 22 + 7, host: hostname(), operation: "checkout", startedAt: 1 };
    writeFileSync(`${slot}.lock`, JSON.stringify(gone));
    expect(await cache.withSlot(slot, async () => "done")).toBe("done");
    expect(existsSync(`${slot}.lock`)).toBe(false);
  });

  it("prunes the least recently used slots until the cache fits its budget", async () => {
    const cache = createCloneCache(reposDir, 150, SHORT_WAIT_MS);
    const older = slotWithFile(cache, URL_A);
    const newer = slotWithFile(cache, URL_B);
    utimesSync(older, 1000, 1000);
    utimesSync(newer, 2000, 2000);
    await cache.prune(join(reposDir, "kept"));
    expect(existsSync(older)).toBe(false);
    expect(existsSync(newer)).toBe(true);
  });

  it("never prunes or clears a slot another process uses", async () => {
    const cache = createCloneCache(reposDir, 0, SHORT_WAIT_MS);
    const busy = slotWithFile(cache, URL_A);
    const idle = slotWithFile(cache, URL_B);
    heldByOtherProcess(busy);

    await cache.prune(join(reposDir, "kept"));
    expect(existsSync(busy)).toBe(true);
    expect(existsSync(idle)).toBe(false);

    slotWithFile(cache, URL_B);
    expect(await cache.clear()).toBeGreaterThan(0);
    expect(existsSync(busy)).toBe(true);
    expect(existsSync(`${busy}.lock`)).toBe(true);
    expect(existsSync(idle)).toBe(false);
  });
});
