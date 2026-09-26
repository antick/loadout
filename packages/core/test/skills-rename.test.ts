import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { RenameOptions } from "@loadout/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setFrontmatterName } from "../src/skills/metadata";
import { renameSkill } from "../src/skills/rename";
import { makeSkill } from "./helpers";
import {
  type WorkspaceWorld,
  createWorkspaceWorld,
  isLink,
  rejection,
  skillText,
} from "./workspace-world";

describe("setting the name in a document", () => {
  it("changes only the name line and keeps line endings and a byte-order mark", () => {
    const text = "﻿---\r\nname: old\r\ndescription: Keep me.\r\n---\r\n\r\nBody\r\n";
    expect(setFrontmatterName(text, "new-name")).toBe(
      "﻿---\r\nname: new-name\r\ndescription: Keep me.\r\n---\r\n\r\nBody\r\n",
    );
  });

  it("quotes a name YAML would read as another type, and adds a missing name", () => {
    expect(setFrontmatterName("---\nname: old\n---\n", "123")).toBe('---\nname: "123"\n---\n');
    expect(setFrontmatterName("---\ndescription: d\n---\nx", "pdf")).toBe(
      "---\nname: pdf\ndescription: d\n---\nx",
    );
  });

  it("replaces a block name and leaves a document without frontmatter alone", () => {
    const block = setFrontmatterName("---\nname: >\n  Old\n  name\ndescription: d\n---\n", "pdf");
    expect(block).toContain("name: pdf\n");
    expect(block).toContain("description: d");
    expect(setFrontmatterName("# No frontmatter\n", "pdf")).toBe("# No frontmatter\n");
  });
});

describe("renaming a library skill", () => {
  let world: WorkspaceWorld;
  let claude: string;
  const rename = (skillId: string, name: string, options?: RenameOptions) =>
    renameSkill(
      world.ctx,
      {
        store: world.store,
        deploy: world.deploy,
        projectSkillFolders: () => world.projects.skillFolders(),
      },
      skillId,
      name,
      options,
    );

  beforeEach(() => {
    world = createWorkspaceWorld();
    world.installAgents(".claude", ".cursor");
    claude = join(world.home, ".claude", "skills");
  });
  afterEach(() => world.cleanup());

  it("moves the folder, the name in SKILL.md and every deployment", async () => {
    const skill = world.addSkill("pdf-tool", { "scripts/run.sh": "echo\n" });
    await world.deploy.api.apply([skill.id], ["claude_code", "cursor"], "add");

    const result = await rename(skill.id, "pdf-forms");

    const renamed = world.store.get(skill.id);
    expect(renamed).toMatchObject({ name: "pdf-forms", dirName: "pdf-forms" });
    expect(existsSync(skill.libraryPath)).toBe(false);
    expect(skillText(renamed.libraryPath)).toContain("name: pdf-forms\ndescription: Test skill");
    expect(readFileSync(join(renamed.libraryPath, "scripts/run.sh"), "utf8")).toBe("echo\n");
    expect(renamed.editedFiles).toEqual(["SKILL.md"]);
    expect(renamed.deployments.map((d) => d.targetPath).sort()).toEqual([
      join(claude, "pdf-forms"),
      join(world.home, ".cursor", "skills", "pdf-forms"),
    ]);
    expect(isLink(join(claude, "pdf-forms"))).toBe(true);
    expect(realpathSync(join(claude, "pdf-forms"))).toBe(realpathSync(renamed.libraryPath));
    expect(existsSync(join(claude, "pdf-tool"))).toBe(false);
    expect(result).toMatchObject({
      dryRun: false,
      from: "pdf-tool",
      to: "pdf-forms",
      agents: ["claude_code", "cursor"],
      failed: [],
    });
  });

  it("moves copies too, and refuses when a copy was edited in the agent's folder", async () => {
    world.ctx.settings.set("deployMode", "copy");
    const skill = world.addSkill("notes");
    await world.deploy.api.deploy(skill.id, "claude_code");
    await rename(skill.id, "meeting-notes");
    const copy = join(claude, "meeting-notes");
    expect(isLink(copy)).toBe(false);
    expect(skillText(copy)).toContain("name: meeting-notes");
    expect(existsSync(join(claude, "notes"))).toBe(false);

    writeFileSync(
      join(copy, "SKILL.md"),
      "---\nname: meeting-notes\ndescription: Edited here.\n---\n",
    );
    const error = await rejection(rename(skill.id, "minutes"));
    expect(error.code).toBe("INVALID_INPUT");
    expect(error.message).toContain(copy);
    expect(world.store.get(skill.id).name).toBe("meeting-notes");
  });

  it("refuses a bad or taken name and a folder in an agent's way, changing nothing", async () => {
    const skill = world.addSkill("alpha");
    world.addSkill("beta");
    mkdirSync(join(world.ctx.paths.skillsDir, "stray"));
    await world.deploy.api.deploy(skill.id, "claude_code");

    expect((await rejection(rename(skill.id, "Bad Name"))).code).toBe("INVALID_INPUT");
    expect((await rejection(rename(skill.id, "beta"))).code).toBe("ALREADY_EXISTS");
    expect((await rejection(rename(skill.id, "stray"))).code).toBe("ALREADY_EXISTS");
    makeSkill(claude, "gamma");
    const conflict = await rejection(rename(skill.id, "gamma"));
    expect(conflict.code).toBe("TARGET_CONFLICT");

    expect(world.store.get(skill.id).libraryPath).toBe(skill.libraryPath);
    expect(isLink(join(claude, "alpha"))).toBe(true);
  });

  it("previews on a dry run, and re-points project links while leaving copies alone", async () => {
    const skill = world.addSkill("lint-rules");
    const repo = join(world.root, "work", "repo");
    mkdirSync(repo, { recursive: true });
    const project = await world.projects.api.add(repo);
    await world.projects.api.exportSkill(skill.id, project.id, ["claude_code"]);
    const projectCopy = makeSkill(join(repo, ".cursor", "skills"), "lint-rules");
    const linked = join(repo, ".claude", "skills", "lint-rules");

    const dry = await rename(skill.id, "style-rules", { dryRun: true });
    expect(dry).toMatchObject({
      dryRun: true,
      projectLinks: [linked],
      projectCopies: [projectCopy],
    });
    expect(world.store.get(skill.id).name).toBe("lint-rules");
    expect(isLink(linked)).toBe(true);

    const result = await rename(skill.id, "style-rules");
    const relinked = join(repo, ".claude", "skills", "style-rules");
    expect(result.projectLinks).toEqual([relinked]);
    expect(existsSync(linked)).toBe(false);
    expect(realpathSync(relinked)).toBe(realpathSync(world.store.get(skill.id).libraryPath));
    expect(skillText(projectCopy)).toContain("name: lint-rules");
  });

  it("changes only the case of a folder name", async () => {
    const skill = world.addSkill("PDF");
    await world.deploy.api.deploy(skill.id, "claude_code");
    await rename(skill.id, "pdf");
    const renamed = world.store.get(skill.id);
    expect(renamed.dirName).toBe("pdf");
    expect(skillText(renamed.libraryPath)).toContain("name: pdf");
    expect(renamed.deployments).toMatchObject([{ targetPath: join(claude, "pdf") }]);
    expect(isLink(join(claude, "pdf"))).toBe(true);
  });
});
