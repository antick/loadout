import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFileHistory } from "../src/editor";
import { readTar } from "../src/install/tar";
import { tempDir } from "./helpers";
import { tarBuffer } from "./install-fixtures";

describe("archive limits", () => {
  it("refuses a tar holding more entries than allowed, however small", () => {
    const tar = tarBuffer([{ name: "a" }, { name: "b" }, { name: "c" }]);
    expect(readTar(tar, 1_000_000, 3)).toHaveLength(3);
    expect(() => readTar(tar, 1_000_000, 2)).toThrow("more than 2 entries");
  });
});

describe("edit history names", () => {
  let temp: ReturnType<typeof tempDir>;
  beforeEach(() => {
    temp = tempDir();
  });
  afterEach(() => temp.cleanup());

  it("keeps a path of dots inside the skill's own history folder", () => {
    const historyDir = join(temp.dir, "history");
    const history = createFileHistory(historyDir);
    history.record("skill-1", "..", Buffer.from("old"), 1_000);
    expect(history.list("skill-1", "..")).toHaveLength(1);
    expect(readdirSync(historyDir)).toEqual(["skill-1"]);
    expect(existsSync(join(historyDir, "skill-1", "%2E%2E"))).toBe(true);
  });
});
