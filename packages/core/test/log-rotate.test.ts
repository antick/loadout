import { existsSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LOG_FILE_NAME, ROTATE_CHECK_LINES, createFileLogger } from "../src/log";
import { tempDir } from "./helpers";

const FULL_LOG_BYTES = 5 * 1024 * 1024 + 1;

describe("file logger", () => {
  let temp: ReturnType<typeof tempDir>;
  beforeEach(() => {
    temp = tempDir();
  });
  afterEach(() => temp.cleanup());

  it("rotates a log that grew too big while the process runs", () => {
    const log = createFileLogger(temp.dir);
    const file = join(temp.dir, LOG_FILE_NAME);
    // As if the app had been running for weeks.
    writeFileSync(file, Buffer.alloc(FULL_LOG_BYTES, "x"));
    for (let line = 0; line < ROTATE_CHECK_LINES; line += 1) log.info(`line ${line}`);
    expect(existsSync(`${file}.1`)).toBe(true);
    expect(statSync(file).size).toBeLessThan(FULL_LOG_BYTES);
  });
});
