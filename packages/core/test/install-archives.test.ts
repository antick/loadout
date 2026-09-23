import { readFileSync } from "node:fs";
import { join } from "node:path";
import { strToU8, zipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { archiveLink, archiveLinkName } from "../src/install";
import { leftoverCheckouts, writeZip } from "./install-fixtures";
import { type UpdatesWorld, createUpdatesWorld } from "./updates-world";

const LINK = "https://downloads.example.com/packs/writing.zip?dl=1";
const SINGLE_LINK = "https://downloads.example.com/helper.skill";

function skillMd(name: string, body = ""): string {
  return `---\nname: ${name}\ndescription: Test skill ${name}\n---\n\n# ${name}\n${body}`;
}

function zip(files: Record<string, string>): Buffer {
  return Buffer.from(
    zipSync(Object.fromEntries(Object.entries(files).map(([name, text]) => [name, strToU8(text)]))),
  );
}

/** Two skills inside one wrapping folder, the way most packs are zipped. */
function pack(proseBody = ""): Buffer {
  return zip({
    "writing/prose/SKILL.md": skillMd("prose", proseBody),
    "writing/prose/notes.md": "notes\n",
    "writing/haiku/SKILL.md": skillMd("haiku"),
  });
}

let world: UpdatesWorld;
/** What the fake web serves, by URL; change it to publish a new version. */
let served: Map<string, Buffer>;
let requests: string[];

beforeEach(() => {
  served = new Map([
    [LINK, pack()],
    [SINGLE_LINK, zip({ "SKILL.md": skillMd("helper") })],
  ]);
  requests = [];
  const fetchImpl = (async (input: string | URL) => {
    const url = String(input);
    requests.push(url);
    const body = served.get(url);
    return body ? new Response(body, { status: 200 }) : new Response("", { status: 404 });
  }) as typeof fetch;
  world = createUpdatesWorld({ fetchImpl });
});

afterEach(() => world.restore());

describe("archive links", () => {
  it("recognises links to archives by their path only", () => {
    expect(archiveLink(` ${LINK} `)).toBe(LINK);
    expect(archiveLink("http://example.com/a/b.SKILL")).toBe("http://example.com/a/b.SKILL");
    expect(archiveLink("https://example.com/my%20skill.zip")).not.toBeNull();
    expect(archiveLinkName("https://example.com/my%20skill.zip")).toBe("my skill.zip");
    for (const text of [
      "https://github.com/owner/repo",
      "https://example.com/download?file=a.zip",
      "ftp://example.com/a.zip",
      "owner/repo",
      "/Users/me/a.zip",
    ]) {
      expect(archiveLink(text)).toBeNull();
    }
  });

  it("downloads a link, lists its skills and installs the chosen ones as linked skills", async () => {
    const preview = await world.install.api.previewGit(LINK);
    expect(preview).toMatchObject({ kind: "archive", repoUrl: LINK, branch: null, revision: null });
    expect(preview.skills.map((skill) => [skill.relPath, skill.name])).toEqual([
      ["writing/haiku", "haiku"],
      ["writing/prose", "prose"],
    ]);
    expect(world.install.progressFor(LINK)).toContain("downloading");

    const [prose] = await world.install.api.confirmGit(preview.previewId, [
      { relPath: "writing/prose", name: "prose" },
    ]);
    expect(prose).toMatchObject({
      name: "prose",
      sourceType: "url",
      sourceRef: LINK,
      sourceUrl: LINK,
      sourceSubpath: "writing/prose",
      updateStatus: "up_to_date",
    });
    expect(readFileSync(join(prose?.libraryPath ?? "", "notes.md"), "utf8")).toBe("notes\n");
    expect(leftoverCheckouts(world.tmp)).toEqual([]);

    const again = await world.install.api.previewGit(LINK);
    expect(again.skills.find((skill) => skill.name === "prose")?.alreadyInstalled).toBe(true);
    await world.install.api.cancelPreview(again.previewId);
  });

  it("installs an archive whose root is the skill, without a subfolder", async () => {
    const preview = await world.install.api.previewGit(SINGLE_LINK);
    expect(preview.skills.map((skill) => skill.name)).toEqual(["helper"]);
    const [helper] = await world.install.api.confirmGit(preview.previewId, [
      { relPath: preview.skills[0]?.relPath ?? "", name: "" },
    ]);
    expect(helper).toMatchObject({ name: "helper", sourceSubpath: null, sourceType: "url" });
  });

  it("checks a linked skill by downloading it again, then downloads the new version", async () => {
    const preview = await world.install.api.previewGit(LINK);
    const [prose, haiku] = await world.install.api.confirmGit(preview.previewId, [
      { relPath: "writing/prose", name: "" },
      { relPath: "writing/haiku", name: "" },
    ]);
    if (!prose || !haiku) throw new Error("fixture not installed");
    expect((await world.updates.api.check(prose.id, true)).updateStatus).toBe("up_to_date");

    served.set(LINK, pack("A new paragraph.\n"));
    requests.length = 0;
    const round = await world.updates.api.checkAll(true);
    expect(round.failed).toEqual([]);
    // Two skills from one link: one download per round.
    expect(requests.filter((url) => url === LINK)).toHaveLength(1);
    expect(world.store.get(prose.id).updateStatus).toBe("update_available");
    expect(world.store.get(haiku.id).updateStatus).toBe("up_to_date");

    const document = await world.updates.api.sourceDocument(prose.id);
    expect(document.content).toContain("A new paragraph.");

    const result = await world.updates.api.reimport(prose.id);
    expect(result.contentChanged).toBe(true);
    expect(world.store.get(prose.id)).toMatchObject({
      sourceType: "url",
      sourceRef: LINK,
      sourceSubpath: "writing/prose",
      updateStatus: "up_to_date",
    });
    expect(readFileSync(join(prose.libraryPath, "SKILL.md"), "utf8")).toContain("A new paragraph.");
  });

  it("marks a linked skill's source as missing when the link stops working", async () => {
    const preview = await world.install.api.previewGit(SINGLE_LINK);
    const [helper] = await world.install.api.confirmGit(preview.previewId, [
      { relPath: preview.skills[0]?.relPath ?? "", name: "" },
    ]);
    served.delete(SINGLE_LINK);
    const checked = await world.updates.api.check(helper?.id ?? "", true);
    expect(checked.updateStatus).toBe("source_missing");
    expect(checked.lastCheckError).toBe(
      `The archive at ${SINGLE_LINK} was not found, or it is private.`,
    );
  });
});

describe("archive files with several skills", () => {
  it("lists them, installs the chosen ones and follows each inside the archive", async () => {
    const path = join(world.root, "bundle.zip");
    writeZip(path, {
      "bundle/prose/SKILL.md": skillMd("prose"),
      "bundle/haiku/SKILL.md": skillMd("haiku"),
    });
    await expect(world.install.api.fromPath(path)).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });

    const preview = await world.install.api.previewArchive(path);
    expect(preview).toMatchObject({ kind: "archive", repoUrl: path });
    const [haiku] = await world.install.api.confirmGit(preview.previewId, [
      { relPath: "bundle/haiku", name: "" },
    ]);
    expect(haiku).toMatchObject({
      sourceType: "local",
      sourceRef: path,
      sourceSubpath: "bundle/haiku",
    });
    expect((await world.updates.api.check(haiku?.id ?? "", true)).updateStatus).toBe("up_to_date");

    writeZip(path, {
      "bundle/prose/SKILL.md": skillMd("prose"),
      "bundle/haiku/SKILL.md": skillMd("haiku", "Changed.\n"),
    });
    expect((await world.updates.api.check(haiku?.id ?? "", true)).updateStatus).toBe(
      "update_available",
    );
    await world.updates.api.reimport(haiku?.id ?? "");
    expect(world.store.get(haiku?.id ?? "")).toMatchObject({ sourceSubpath: "bundle/haiku" });
  });

  it("still installs a single-skill archive in one step, as before", async () => {
    const path = join(world.root, "one.zip");
    writeZip(path, { "one/SKILL.md": skillMd("one") });
    const skill = await world.install.api.fromPath(path);
    expect(skill).toMatchObject({ name: "one", sourceType: "local", sourceSubpath: null });
    expect((await world.updates.api.check(skill.id, true)).updateStatus).toBe("up_to_date");
  });
});
