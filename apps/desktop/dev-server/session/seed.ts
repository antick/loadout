import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { CoreApi } from "@loadout/shared";
import { installFolder, installFromGit, saveFile, skillNamed } from "./actions.ts";
import { createRepository, initBare, pushFiles, writeFiles } from "./files.ts";
import {
  ACME_SKILLS,
  AGENT_FOLDERS,
  AGENT_SKILLS,
  AUTHORED,
  BACKUP_IGNORE,
  CLAUDE_SKILLS_DIR,
  CUSTOM_AGENT,
  DEPLOYMENTS,
  DEVICE_NAME,
  FAVORITES,
  FRONTEND,
  LOCAL_SKILLS,
  MISSING_PROJECT,
  NOTES,
  PRESETS,
  PROJECTS,
  PROJECTS_DIR,
  PUBLISH_TARGET,
  TAGS,
  BACKUP_REPOSITORY,
} from "./fixtures.ts";
import { API_DOCS_REFERENCE, CLAUDE_OWN_SKILLS, skillDocument } from "./fixtures-skills.ts";
import { GITHUB_LOGIN, GITHUB_PUBLIC_REPOSITORIES } from "./fixtures-web.ts";
import type { World } from "./world.ts";

/** Folders and repositories the seed starts from, written before core opens the home. */
export function seedFiles(world: World): void {
  for (const folder of AGENT_FOLDERS) mkdirSync(join(world.home, folder), { recursive: true });
  for (const [name, description] of Object.entries(CLAUDE_OWN_SKILLS)) {
    const document = skillDocument(name, description, description);
    writeFiles(join(world.home, CLAUDE_SKILLS_DIR, name), { "SKILL.md": document });
  }
  for (const project of PROJECTS) {
    writeFiles(join(world.home, PROJECTS_DIR, project.name), project.files);
  }
  pushFiles(world, ACME_SKILLS.url, ACME_SKILLS.first, "Add the first skills");
  pushFiles(world, AGENT_SKILLS.url, AGENT_SKILLS.first, "Add pr-summary");
  pushFiles(world, FRONTEND.url, FRONTEND.files, "Add react-patterns");
  pushFiles(world, PUBLISH_TARGET.url, PUBLISH_TARGET.files, "Publish two skills");
  for (const name of GITHUB_PUBLIC_REPOSITORIES) {
    createRepository(world, `https://github.com/${GITHUB_LOGIN}/${name}`);
  }
}

/**
 * Fill the library the way a person would, through the API: install, tag, deploy, back up.
 * Then the repositories move on, so there is an update, a new skill and a missing one to see.
 */
export async function seedLibrary(world: World, api: CoreApi): Promise<void> {
  await api.agents.addCustom({
    displayName: CUSTOM_AGENT.displayName,
    skillsDir: join(world.home, CUSTOM_AGENT.skillsDir),
  });
  await installFromGit(api, ACME_SKILLS.url, ACME_SKILLS.installed);
  await installFromGit(api, AGENT_SKILLS.url, null);
  await api.install.fromMarket(FRONTEND.source, FRONTEND.skill);
  for (const [name, files] of Object.entries(LOCAL_SKILLS)) {
    await installFolder(world, api, name, files);
  }
  const ids = new Map((await api.skills.list()).map((skill) => [skill.name, skill.id]));
  const id = (name: string): string => ids.get(name) ?? name;
  for (const name of AUTHORED) await api.skills.setAuthored(id(name), true);
  for (const [name, tags] of Object.entries(TAGS)) await api.skills.setTags(id(name), tags);
  for (const [name, note] of Object.entries(NOTES)) await api.skills.setNote(id(name), note);
  for (const name of FAVORITES) await api.skills.setFavorite(id(name), true);
  for (const [name, agents] of Object.entries(DEPLOYMENTS)) {
    for (const agent of agents) await api.deploy.deploy(id(name), agent);
  }
  for (const preset of PRESETS) {
    const created = await api.presets.create(preset);
    await api.presets.addSkills(created.id, preset.skills.map(id));
  }
  await seedProjects(world, api, id);

  pushFiles(world, ACME_SKILLS.url, ACME_SKILLS.next, "Improve code-review, add two skills");
  pushFiles(world, AGENT_SKILLS.url, AGENT_SKILLS.next, "Retire pr-summary");
  await api.updates.checkAll(true);
  // Updating finds the skill gone from its repository, as trying it in the app would.
  await api.updates.update((await skillNamed(api, "pr-summary")).id).catch(() => undefined);
  await api.updates.checkSources();

  await api.backup.setDeviceName(DEVICE_NAME);
  await api.backup.init();
  await api.backup.setRemote(initBare(join(world.remotes, BACKUP_REPOSITORY)));
  await api.backup.setIgnoreRules(BACKUP_IGNORE);
  await api.backup.sync();
  // Edited after the backup: the token pasted into it holds the next one back.
  await saveFile(api, "api-docs", API_DOCS_REFERENCE.path, API_DOCS_REFERENCE.text);
}

async function seedProjects(
  world: World,
  api: CoreApi,
  id: (name: string) => string,
): Promise<void> {
  for (const project of PROJECTS) {
    const added = await api.projects.add(join(world.home, PROJECTS_DIR, project.name));
    if (project.pinned) await api.projects.setPinned(added.id, true);
    for (let open = 0; open < (project.opens ?? 0); open += 1) {
      await api.projects.recordOpen(added.id);
    }
    for (const [skill, agents] of Object.entries(project.skills ?? {})) {
      await api.projects.exportSkill(id(skill), added.id, agents);
    }
  }
  const missing = join(world.home, PROJECTS_DIR, MISSING_PROJECT);
  mkdirSync(missing, { recursive: true });
  await api.projects.addLinked(MISSING_PROJECT, missing);
  rmSync(missing, { recursive: true, force: true });
}
