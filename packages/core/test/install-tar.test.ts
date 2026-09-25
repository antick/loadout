import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { archiveExtension, isArchivePath } from "../src/install";
import { tarBuffer } from "./install-fixtures";
import { type UpdatesWorld, createUpdatesWorld } from "./updates-world";

const LINK = "https://downloads.example.com/packs/writing.tgz";

function skillMd(name: string, body = ""): string {
  return `---\nname: ${name}\ndescription: Test skill ${name}\n---\n\n# ${name}\n${body}`;
}

/** Two skills in a wrapping folder, plus a script that must stay executable. */
function pack(): Buffer {
  return tarBuffer([
    { name: "writing/", type: "5", mode: 0o755 },
    { name: "writing/prose/SKILL.md", content: skillMd("prose") },
    { name: "writing/prose/run.sh", content: "#!/bin/sh\n", mode: 0o755 },
    { name: "writing/haiku/SKILL.md", content: skillMd("haiku") },
  ]);
}

let world: UpdatesWorld;
let served: Map<string, Buffer>;

beforeEach(() => {
  served = new Map([[LINK, gzipSync(pack())]]);
  const fetchImpl = (async (input: string | URL) => {
    const body = served.get(String(input));
    return body ? new Response(body, { status: 200 }) : new Response("", { status: 404 });
  }) as typeof fetch;
  world = createUpdatesWorld({ fetchImpl });
});

afterEach(() => world.restore());

describe("tar archives", () => {
  it("knows the tar extensions, longest first", () => {
    expect(archiveExtension("/a/b.tar.gz")).toBe(".tar.gz");
    expect(archiveExtension("B.TGZ")).toBe(".tgz");
    expect(archiveExtension("c.tar")).toBe(".tar");
    expect(archiveExtension("d.gz")).toBeNull();
    expect(isArchivePath("e.zip")).toBe(true);
  });

  it("lists and installs skills from a .tar.gz on this computer, keeping the executable bit", async () => {
    const path = join(world.root, "writing.tar.gz");
    writeFileSync(path, gzipSync(pack()));
    const preview = await world.install.api.previewArchive(path);
    expect(preview.skills.map((skill) => skill.relPath)).toEqual([
      "writing/haiku",
      "writing/prose",
    ]);
    const [prose] = await world.install.api.confirmGit(preview.previewId, [
      { relPath: "writing/prose", name: "" },
    ]);
    if (!prose) throw new Error("not installed");
    expect(prose).toMatchObject({ name: "prose", sourceSubpath: "writing/prose" });
    if (process.platform !== "win32") {
      expect(statSync(join(prose.libraryPath, "run.sh")).mode & 0o111).not.toBe(0);
    }
    expect((await world.updates.api.check(prose.id, true)).updateStatus).toBe("up_to_date");
  });

  it("installs a plain .tar holding one skill in one step", async () => {
    const path = join(world.root, "solo.tar");
    writeFileSync(path, tarBuffer([{ name: "SKILL.md", content: skillMd("solo") }]));
    const skill = await world.install.api.fromPath(path);
    expect(skill).toMatchObject({ name: "solo", sourceType: "local" });
  });

  it("downloads a .tgz link and follows it for updates", async () => {
    const preview = await world.install.api.previewGit(LINK);
    expect(preview.kind).toBe("archive");
    const [haiku] = await world.install.api.confirmGit(preview.previewId, [
      { relPath: "writing/haiku", name: "" },
    ]);
    expect(haiku).toMatchObject({ sourceType: "url", sourceRef: LINK });
    expect((await world.updates.api.check(haiku?.id ?? "", true)).updateStatus).toBe("up_to_date");
  });

  it("reads GNU long names, and skips links and paths that climb out", async () => {
    const longFolder = `${"deep-".repeat(25)}skill`;
    const path = join(world.root, "tricky.tar");
    writeFileSync(
      path,
      tarBuffer([
        { name: "././@LongLink", type: "L", content: `${longFolder}/SKILL.md` },
        { name: "ignored", content: skillMd("longname") },
        { name: "../escape/SKILL.md", content: skillMd("escape") },
        { name: "/abs/SKILL.md", content: skillMd("abs") },
        { name: "linked", type: "2", linkTarget: "/etc/passwd" },
      ]),
    );
    const preview = await world.install.api.previewArchive(path);
    expect(preview.skills.map((skill) => skill.relPath)).toEqual([longFolder]);
    const [skill] = await world.install.api.confirmGit(preview.previewId, [
      { relPath: longFolder, name: "" },
    ]);
    expect(readFileSync(join(skill?.libraryPath ?? "", "SKILL.md"), "utf8")).toContain("longname");
  });

  it("reads an archive made by the system's own tar", async () => {
    const folder = join(world.root, "made", "native-skill");
    mkdirSync(join(folder, "references"), { recursive: true });
    writeFileSync(join(folder, "SKILL.md"), skillMd("native-skill"));
    writeFileSync(join(folder, "references", "guide.md"), "guide\n");
    const path = join(world.root, "native.tar.gz");
    execFileSync("tar", ["-czf", path, "-C", join(world.root, "made"), "native-skill"]);
    const skill = await world.install.api.fromPath(path);
    expect(readFileSync(join(skill.libraryPath, "references", "guide.md"), "utf8")).toBe("guide\n");
  });

  it("refuses a damaged archive with a plain message", async () => {
    const path = join(world.root, "broken.tar.gz");
    writeFileSync(path, Buffer.from([0x1f, 0x8b, 1, 2, 3]));
    await expect(world.install.api.previewArchive(path)).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
  });
});
