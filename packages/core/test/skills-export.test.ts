import { chmodSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { unzipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFileHistory } from "../src/editor";
import { type SkillsService, createSkillsService } from "../src/skills/service";
import { makeSkill, writeFile } from "./helpers";
import { type UpdatesWorld, createUpdatesWorld } from "./updates-world";

let world: UpdatesWorld;
let skills: SkillsService;
let out: string;

beforeEach(() => {
  world = createUpdatesWorld();
  skills = createSkillsService(world.ctx, {
    store: world.store,
    removeDeployments: async () => undefined,
    history: createFileHistory(world.ctx.paths.historyDir),
  });
  out = join(world.root, "out");
});
afterEach(() => world.restore());

async function librarySkill(name: string, files: Record<string, string> = {}) {
  return world.install.api.fromPath(makeSkill(join(world.root, "src"), name, { files }));
}

describe("export", () => {
  it("packs one skill into a folder of its own, keeping the executable bit", async () => {
    const skill = await librarySkill("pdf", { "scripts/run.sh": "echo pdf\n" });
    const script = join(skill.libraryPath, "scripts", "run.sh");
    chmodSync(script, 0o755);
    writeFileSync(join(skill.libraryPath, ".DS_Store"), "junk");

    const path = join(out, "pdf.zip");
    const result = await skills.api.exportArchive([skill.id], path);
    expect(result).toMatchObject({ path, skillCount: 1 });
    expect(result.bytes).toBe(statSync(path).size);

    const entries = unzipSync(readFileSync(path));
    expect(Object.keys(entries).sort()).toEqual(["pdf/SKILL.md", "pdf/scripts/run.sh"]);
    expect(world.ctx.activity.list()[0]).toMatchObject({
      kind: "export",
      subject: "pdf",
      detail: path,
    });

    // Installs again as the same skill, with the script still executable.
    const again = await world.install.api.fromPath(path, "pdf-copy");
    expect(readFileSync(join(again.libraryPath, "SKILL.md"), "utf8")).toBe(
      readFileSync(join(skill.libraryPath, "SKILL.md"), "utf8"),
    );
    if (process.platform !== "win32") {
      expect(statSync(join(again.libraryPath, "scripts", "run.sh")).mode & 0o111).not.toBe(0);
    }
  });

  it("packs several skills into one archive that installs them all again", async () => {
    const first = await librarySkill("alpha");
    const second = await librarySkill("beta");
    const path = join(out, "both.zip");
    const result = await skills.api.exportArchive([first.id, second.id, first.id], path);
    expect(result.skillCount).toBe(2);

    const preview = await world.install.api.previewArchive(path);
    expect(preview.skills.map((skill) => [skill.relPath, skill.name])).toEqual([
      ["alpha", "alpha"],
      ["beta", "beta"],
    ]);
    await world.install.api.cancelPreview(preview.previewId);
  });

  it("replaces an older export at the same path", async () => {
    const skill = await librarySkill("pdf");
    const path = join(out, "pdf.zip");
    await skills.api.exportArchive([skill.id], path);
    writeFile(join(skill.libraryPath, "notes.md"), "new\n");
    await skills.api.exportArchive([skill.id], path);
    expect(Object.keys(unzipSync(readFileSync(path)))).toContain("pdf/notes.md");
  });

  it("refuses a path it should not write", async () => {
    const skill = await librarySkill("pdf");
    const cases: [string, string][] = [
      [join(out, "pdf.tar"), ".zip or .skill"],
      ["relative/pdf.zip", "absolute"],
      [join(world.ctx.paths.skillsDir, "pdf.zip"), "outside the skill library"],
    ];
    for (const [path, message] of cases) {
      await expect(skills.api.exportArchive([skill.id], path)).rejects.toMatchObject({
        code: "INVALID_INPUT",
        message: expect.stringContaining(message),
      });
    }
    await expect(skills.api.exportArchive([], join(out, "none.zip"))).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
    await expect(skills.api.exportArchive(["missing"], join(out, "x.zip"))).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
