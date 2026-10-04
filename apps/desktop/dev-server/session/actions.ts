/** Steps a person takes in the app, through the real API: shared by the seed and the scenarios. */
import { join } from "node:path";
import type { CoreApi, Skill } from "@loadout/shared";
import { writeFiles } from "./files.ts";
import type { Files } from "./fixtures-skills.ts";
import { LOCAL_SKILLS_DIR } from "./fixtures.ts";
import type { World } from "./world.ts";

export async function skillNamed(api: CoreApi, name: string): Promise<Skill> {
  const found = (await api.skills.list()).find((skill) => skill.name === name);
  if (!found) throw new Error(`The library has no skill named ${name}`);
  return found;
}

/** Install the skills of a repository named in `names` (every one when null). */
export async function installFromGit(
  api: CoreApi,
  url: string,
  names: string[] | null,
): Promise<void> {
  const preview = await api.install.previewGit(url);
  const chosen = preview.skills.filter((skill) => !names || names.includes(skill.name));
  await api.install.confirmGit(
    preview.previewId,
    chosen.map((skill) => ({ relPath: skill.relPath, name: skill.name })),
  );
}

/** Install a skill folder from `~/Downloads/skills`, writing it there first when given files. */
export async function installFolder(
  world: World,
  api: CoreApi,
  name: string,
  files?: Files,
): Promise<Skill> {
  const dir = join(world.home, ...LOCAL_SKILLS_DIR, name);
  if (files) writeFiles(dir, files);
  return api.install.fromPath(dir);
}

/** Write a file of a library skill in the editor: a new file, or over the one there. */
export async function saveFile(
  api: CoreApi,
  name: string,
  path: string,
  content: string,
): Promise<void> {
  const location = { kind: "library", skillId: (await skillNamed(api, name)).id } as const;
  const files = await api.editor.files(location);
  if (!files.some((file) => file.path === path)) await api.editor.createFile(location, path);
  const current = await api.editor.readFile(location, path);
  await api.editor.saveFile(location, { path, content, baseHash: current.hash });
}

/** Say "back up anyway" to everything the backup holds back, as the Backup page offers. */
export async function allowHeldBack(api: CoreApi): Promise<void> {
  const findings = await api.backup.secretFindings();
  if (findings.length > 0) await api.backup.allowSecrets(findings.map((finding) => finding.id));
}
