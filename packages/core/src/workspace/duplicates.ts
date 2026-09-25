import { basename } from "node:path";
import type { LocalSkill, SkillDuplicate } from "@loadout/shared";
import type { AgentRegistry, ResolvedAgent } from "../agents/registry";
import { samePath } from "../deploy/evidence";
import type { ResolvedTarget } from "../projects/targets";
import { readSkillIdentity } from "../skills/metadata";
import { canonicalPath, isDirectory } from "../util/fs";
import { findLocalSkillDirs } from "./local-scan";

/**
 * Copies of a skill that one agent loads more than once: from its own folder and a shared one it
 * also reads (`~/.agents/skills`), or from a project and its global folder. Only the fact is
 * reported; which copy the agent prefers is the agent's business.
 */

/** Skill folders in `root` by lower-case skill name and folder name. Reads names, never hashes. */
function copiesIn(root: string, recursive: boolean): Map<string, string> {
  const copies = new Map<string, string>();
  if (!isDirectory(root)) return copies;
  for (const dir of findLocalSkillDirs(root, { recursive })) {
    copies.set(readSkillIdentity(dir.path).name.toLowerCase(), dir.path);
    copies.set(basename(dir.path).toLowerCase(), dir.path);
  }
  return copies;
}

/** Two paths that reach the same folder, through links or not. */
function sameFolder(a: string, b: string): boolean {
  return samePath(a, b) || canonicalPath(a) === canonicalPath(b);
}

/**
 * The other copy of `skill` among `copies`; null when there is none, or it is this very folder
 * (a link to it is one copy, not two).
 */
function otherCopy(skill: LocalSkill, copies: Map<string, string>): string | null {
  const path = copies.get(skill.name.toLowerCase()) ?? copies.get(skill.dirName.toLowerCase());
  return path && !sameFolder(path, skill.path) ? path : null;
}

function addDuplicates(skill: LocalSkill, found: SkillDuplicate[]): LocalSkill {
  return found.length > 0 ? { ...skill, duplicates: [...skill.duplicates, ...found] } : skill;
}

/** Mark skills of an agent's own folder that a shared folder it also reads holds too. */
export function withSharedFolderDuplicates(
  agent: ResolvedAgent,
  skills: LocalSkill[],
): LocalSkill[] {
  const shared = agent.extraScanDirs
    .filter((dir) => !samePath(dir, agent.skillsDir))
    .map((dir) => copiesIn(dir, false));
  if (shared.length === 0) return skills;
  return skills.map((skill) =>
    addDuplicates(
      skill,
      shared.flatMap((copies): SkillDuplicate[] => {
        const path = otherCopy(skill, copies);
        return path
          ? [
              {
                where: "shared_folder",
                agentKey: agent.key,
                agentDisplayName: agent.displayName,
                path,
              },
            ]
          : [];
      }),
    ),
  );
}

/**
 * Mark switched-on project skills that the same agents also have in their global folder. A
 * switched-off copy is not loaded, so it is never a duplicate.
 */
export function withGlobalDuplicates(
  skills: LocalSkill[],
  targets: readonly ResolvedTarget[],
  registry: AgentRegistry,
): LocalSkill[] {
  const globalCopies = new Map<string, Map<string, string>>();
  const copiesOf = (agent: ResolvedAgent): Map<string, string> => {
    let copies = globalCopies.get(agent.key);
    if (!copies) {
      copies = copiesIn(agent.skillsDir, agent.recursiveScan);
      globalCopies.set(agent.key, copies);
    }
    return copies;
  };
  return skills.map((skill) => {
    if (!skill.enabled) return skill;
    const target = targets.find((candidate) => candidate.key === skill.agentKey);
    const agents = (target?.agentKeys ?? [skill.agentKey]).flatMap(
      (key) => registry.find(key) ?? [],
    );
    return addDuplicates(
      skill,
      agents.flatMap((agent): SkillDuplicate[] => {
        const path = otherCopy(skill, copiesOf(agent));
        return path
          ? [{ where: "global", agentKey: agent.key, agentDisplayName: agent.displayName, path }]
          : [];
      }),
    );
  });
}
