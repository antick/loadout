import {
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import type * as NodeFs from "node:fs";
import { hostname, tmpdir, uptime } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RepoLock } from "../src/lock";
import { hashDir } from "../src/util/hash";
import { createTestWorld, makeSkill } from "./helpers";

/** Set to make the next write into a file descriptor fail as a full disk does. */
const failWrites = vi.hoisted(() => ({ next: false }));
vi.mock("node:fs", async (importOriginal) => {
  const fs = await importOriginal<typeof NodeFs>();
  return {
    ...fs,
    writeSync: (...args: Parameters<typeof fs.writeSync>) => {
      if (failWrites.next) {
        failWrites.next = false;
        throw Object.assign(new Error("no space left on device"), { code: "ENOSPC" });
      }
      return fs.writeSync(...args);
    },
  };
});

let dir: string;
let path: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "lock-"));
  path = join(dir, ".loadout.lock");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 20));

describe("library lock", () => {
  it("makes unrelated operations of one process take turns", async () => {
    const lock = new RepoLock(path);
    const order: string[] = [];
    const a = lock.run("a", async () => {
      order.push("a start");
      await tick();
      order.push("a end");
    });
    const b = lock.run("b", async () => {
      order.push("b start");
      await tick();
      order.push("b end");
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    // `a` holds the lock now: background work skips instead of running alongside it.
    const c = await lock.tryRun("c", () => order.push("c ran"));
    await Promise.all([a, b]);
    expect(c).toBeNull();
    expect(order).toEqual(["a start", "a end", "b start", "b end"]);
  });

  it("leaves no empty lock file behind when writing it fails", async () => {
    const lock = new RepoLock(path);
    failWrites.next = true;
    await expect(lock.run("a", () => "never")).rejects.toMatchObject({ code: "ENOSPC" });
    expect(existsSync(path)).toBe(false);
    expect(await lock.run("b", () => "ran")).toBe("ran");
  });

  it("lets a nested call of the holder through", async () => {
    const lock = new RepoLock(path);
    const inner = await lock.run("outer", () => lock.run("inner", () => "nested"));
    expect(inner).toBe("nested");
    expect(await lock.tryRun("after", () => "free again")).toBe("free again");
  });

  it("makes work the holder scheduled wait its turn once the holder is done", async () => {
    const lock = new RepoLock(path);
    const order: string[] = [];
    let later: Promise<unknown> | undefined;
    await lock.run("a", () => {
      setTimeout(() => {
        later = lock.run("later", () => order.push("later"));
      }, 10);
    });
    const b = lock.run("b", async () => {
      order.push("b start");
      await new Promise((resolve) => setTimeout(resolve, 40));
      order.push("b end");
    });
    await b;
    await later;
    expect(order).toEqual(["b start", "b end", "later"]);
  });

  it("runs work started outside the holder's turn after it, not inside it", async () => {
    const lock = new RepoLock(path);
    const order: string[] = [];
    let later: Promise<unknown> | undefined;
    await lock.run("a", async () => {
      order.push("a start");
      later = lock.outside(() => lock.run("later", () => order.push("later")));
      await tick();
      order.push("a end");
    });
    await later;
    expect(order).toEqual(["a start", "a end", "later"]);
  });

  it("keeps a live process's lock however long held, and clears a dead or unreadable one", async () => {
    const lock = new RepoLock(path);
    const old = Date.now() - 60 * 60 * 1000;
    // This test's own parent process is alive: its lock stands.
    writeFileSync(
      path,
      JSON.stringify({ pid: process.ppid, host: hostname(), operation: "x", startedAt: old }),
    );
    expect(await lock.tryRun("mine", () => "ran")).toBeNull();

    writeFileSync(
      path,
      JSON.stringify({ pid: 2 ** 22 + 7, host: hostname(), operation: "x", startedAt: old }),
    );
    await lock.tryRun("mine", () => "ran"); // clears the dead holder's file
    expect(await lock.tryRun("mine", () => "ran")).toBe("ran");

    writeFileSync(path, "");
    const when = new Date(old);
    utimesSync(path, when, when);
    await lock.tryRun("mine", () => "ran");
    expect(await lock.tryRun("mine", () => "ran")).toBe("ran");
    // Cleared files are moved aside before they go: none of them is left behind.
    expect(readdirSync(dir)).toEqual([]);
  });

  it("clears a lock older than this computer's start, though its pid now runs again", async () => {
    const lock = new RepoLock(path);
    // The pid of a live process: after a restart another program may well have it.
    writeFileSync(
      path,
      JSON.stringify({ pid: process.ppid, host: hostname(), operation: "x", startedAt: 0 }),
    );
    const beforeBoot = new Date(Date.now() - (uptime() + 60) * 1000);
    utimesSync(path, beforeBoot, beforeBoot);
    await lock.tryRun("mine", () => "ran");
    expect(await lock.tryRun("mine", () => "ran")).toBe("ran");
  });

  it("clears a lock of another host only once no heartbeat moved it on", async () => {
    const lock = new RepoLock(path, { staleMs: 1000 });
    const other = { pid: process.ppid, host: "renamed-host.local", operation: "x", startedAt: 0 };
    writeFileSync(path, JSON.stringify(other));
    expect(await lock.tryRun("mine", () => "ran")).toBeNull();

    const stale = new Date(Date.now() - 5000);
    utimesSync(path, stale, stale);
    await lock.tryRun("mine", () => "ran");
    expect(await lock.tryRun("mine", () => "ran")).toBe("ran");
  });

  it("keeps a held lock fresh with a heartbeat, so a long operation never loses it", async () => {
    const holder = new RepoLock(path, { heartbeatMs: 10 });
    const waiter = new RepoLock(path, { staleMs: 200, waitMs: 0 });
    await holder.run("long operation", async () => {
      const old = new Date(Date.now() - 10_000);
      utimesSync(path, old, old);
      await new Promise((resolve) => setTimeout(resolve, 60));
      expect(Date.now() - statSync(path).mtimeMs).toBeLessThan(200);
      expect(await waiter.tryRun("other", () => "stole it")).toBeNull();
    });
    expect(existsSync(path)).toBe(false);
  });

  it("writes metadata asked for inside an operation only once that operation is done", async () => {
    const world = createTestWorld();
    try {
      const { ctx, store } = world;
      const skillDir = makeSkill(ctx.paths.skillsDir, "alpha");
      const metadata = (id: string): string => join(ctx.paths.metadataDir, "skills", `${id}.json`);
      let id = "";
      let writtenDuringOperation = true;
      await ctx.lock.run("operation", async () => {
        id = store.insert({
          name: "alpha",
          description: "Test skill alpha",
          sourceType: "local",
          libraryPath: skillDir,
          contentHash: hashDir(skillDir),
          updateStatus: "local_only",
        }).id;
        ctx.touched("skills");
        await new Promise((resolve) => setTimeout(resolve, 40));
        writtenDuringOperation = existsSync(metadata(id));
      });
      await new Promise((resolve) => setTimeout(resolve, 40));
      expect(writtenDuringOperation).toBe(false);
      expect(existsSync(metadata(id))).toBe(true);
    } finally {
      world.cleanup();
    }
  });
});
