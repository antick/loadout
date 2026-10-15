import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { strToU8, zipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFileHistory } from "../src/editor";
import { unpackArchiveInto } from "../src/install/archive";
import { MAX_ARCHIVE_ENTRIES, readTar } from "../src/install/tar";
import { tempDir } from "./helpers";
import { tarBuffer } from "./install-fixtures";

const LOCAL_SIGNATURE = 0x04034b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const END_SIGNATURE = 0x06054b50;
const LOCAL_LENGTH = 30;
const CENTRAL_LENGTH = 46;
const END_LENGTH = 22;
const ZIP_VERSION = 20;

/**
 * A zip whose `count` central-directory entries, stored and each claiming one byte, all point at
 * the same local entry of `payload` bytes: every entry unpacks to the whole payload.
 */
function overlappingZip(payload: number, count: number): Buffer {
  const name = Buffer.from("p");
  const local = Buffer.alloc(LOCAL_LENGTH);
  local.writeUInt32LE(LOCAL_SIGNATURE, 0);
  local.writeUInt16LE(ZIP_VERSION, 4);
  local.writeUInt32LE(payload, 18);
  local.writeUInt32LE(1, 22);
  local.writeUInt16LE(name.length, 26);
  const body = [local, name, Buffer.alloc(payload, 0x41)];
  const central = Array.from({ length: count }, (_, index) => {
    const entryName = Buffer.from(`f${index}.txt`);
    const header = Buffer.alloc(CENTRAL_LENGTH);
    header.writeUInt32LE(CENTRAL_SIGNATURE, 0);
    header.writeUInt16LE(ZIP_VERSION, 4);
    header.writeUInt16LE(ZIP_VERSION, 6);
    header.writeUInt32LE(payload, 20);
    header.writeUInt32LE(1, 24);
    header.writeUInt16LE(entryName.length, 28);
    return Buffer.concat([header, entryName]);
  });
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(END_LENGTH);
  end.writeUInt32LE(END_SIGNATURE, 0);
  end.writeUInt16LE(count, 8);
  end.writeUInt16LE(count, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(LOCAL_LENGTH + name.length + payload, 16);
  return Buffer.concat([...body, directory, end]);
}

describe("archive limits", () => {
  let temp: ReturnType<typeof tempDir>;
  beforeEach(() => {
    temp = tempDir();
  });
  afterEach(() => temp.cleanup());

  it("refuses stored zip entries that claim fewer bytes than they unpack to", () => {
    const root = join(temp.dir, "bomb");
    expect(() => unpackArchiveInto(overlappingZip(1024, 3), "bomb.zip", root)).toThrow(
      "does not match its recorded size",
    );
    expect(existsSync(root)).toBe(false);
  });

  it("still unpacks stored zip entries, and counts what it wrote", () => {
    const root = join(temp.dir, "stored");
    const zip = zipSync({ "SKILL.md": strToU8("stored text") }, { level: 0 });
    expect(unpackArchiveInto(Buffer.from(zip), "stored.zip", root)).toBe("stored text".length);
    expect(readFileSync(join(root, "SKILL.md"), "utf8")).toBe("stored text");
  });

  it("refuses a tar holding more entries than allowed, however small", () => {
    const entries = Array.from({ length: MAX_ARCHIVE_ENTRIES }, (_, index) => ({
      name: `f${index}`,
    }));
    expect(readTar(tarBuffer(entries), 1_000_000)).toHaveLength(MAX_ARCHIVE_ENTRIES);
    const oneMore = tarBuffer([...entries, { name: "one-more" }]);
    expect(() => readTar(oneMore, 1_000_000)).toThrow(`more than ${MAX_ARCHIVE_ENTRIES} entries`);
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
