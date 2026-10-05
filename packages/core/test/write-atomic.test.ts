import * as fs from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { writeFileAtomic } from "../src/util/fs";
import { tempDir } from "./helpers";

/** Permission bits of every file as it was first written, before anything else touched it. */
const firstModes: number[] = [];

vi.mock("node:fs", async (original) => {
  const actual = await original<typeof fs>();
  return {
    ...actual,
    writeFileSync: (...args: Parameters<typeof actual.writeFileSync>) => {
      actual.writeFileSync(...args);
      if (typeof args[0] === "string") firstModes.push(actual.statSync(args[0]).mode & 0o777);
    },
  };
});

const PRIVATE = 0o600;
const OTHERS = 0o077;

describe("writing a private file", () => {
  let temp: ReturnType<typeof tempDir>;
  let umask: number;
  beforeEach(() => {
    temp = tempDir();
    firstModes.length = 0;
    // The most permissive umask: only the mode passed keeps others out.
    umask = process.umask(0);
  });
  afterEach(() => {
    process.umask(umask);
    temp.cleanup();
  });

  it.skipIf(process.platform === "win32")("never lets others read it, not even halfway", () => {
    const path = join(temp.dir, "secrets.json");
    writeFileAtomic(path, "{}", PRIVATE);
    expect(firstModes).toHaveLength(1);
    expect((firstModes[0] ?? OTHERS) & OTHERS).toBe(0);
    expect(fs.statSync(path).mode & 0o777).toBe(PRIVATE);
  });
});
