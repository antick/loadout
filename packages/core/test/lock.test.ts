import { existsSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RepoLock } from "../src/lock";
import { hashDir } from "../src/util/hash";
import { createTestWorld, makeSkill } from "./helpers";

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

  it("keeps a live process's lock however old, and clears a dead or unreadable one", async () => {
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
