import { basename, join } from "node:path";
import type { LocalSkill, SkillDuplicate } from "@loadout/shared";
import type { AgentRegistry, ResolvedAgent } from "../agents/registry";
import { samePath } from "../deploy/evidence";
import type { ResolvedTarget } from "../projects/targets";
import { readSkillIdentity } from "../skills/metadata";
import { canonicalPath, isDirectory } from "../util/fs";
import { findLocalSkillDirs } from "./local-scan";

/**
 * Copies of a skill that one agent loads more than once: from its own folder and another it also
 * reads (`~/.agents/skills`, `~/.claude/skills`), or from a project and a global folder, or from
 * two folders of one project. Only the fact is reported; which copy the agent prefers is the
 * agent's business.
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

/** Installed agents behind a project skill's target. Uninstalled agents load nothing. */
function agentsLoading(
  skill: LocalSkill,
  targets: readonly ResolvedTarget[],
  registry: AgentRegistry,
): { agents: ResolvedAgent[]; target: ResolvedTarget | undefined } {
  const target = targets.find((candidate) => candidate.key === skill.agentKey);
  const agents = (target?.agentKeys ?? [skill.agentKey])
    .flatMap((key) => registry.find(key) ?? [])
    .filter((agent) => agent.installed);
  return { agents, target };
}

/**
 * Mark switched-on project skills that the same agents also load from elsewhere: their global
 * folder or another global folder they read (`global`), or another folder of this project they
 * read, such as Copilot reading `.claude/skills` (`shared_folder`). A switched-off copy is not
 * loaded, so it is never a duplicate.
 */
export function withProjectDuplicates(
  skills: LocalSkill[],
  targets: readonly ResolvedTarget[],
  registry: AgentRegistry,
  projectPath: string,
): LocalSkill[] {
  const cache = new Map<string, Map<string, string>>();
  const copiesAt = (root: string, recursive: boolean): Map<string, string> => {
    const key = `${recursive ? "r" : "f"}:${root}`;
    let copies = cache.get(key);
    if (!copies) {
      copies = copiesIn(root, recursive);
      cache.set(key, copies);
    }
    return copies;
  };
  return skills.map((skill) => {
    if (!skill.enabled) return skill;
    const { agents, target } = agentsLoading(skill, targets, registry);
    const found: SkillDuplicate[] = [];
    const seen = new Set<string>();
    const add = (duplicate: SkillDuplicate): void => {
      const key = `${duplicate.agentKey}:${canonicalPath(duplicate.path)}`;
      if (seen.has(key)) return;
      seen.add(key);
      found.push(duplicate);
    };
    for (const agent of agents) {
      const who = { agentKey: agent.key, agentDisplayName: agent.displayName };
      const globalRoots = [
        { root: agent.skillsDir, recursive: agent.recursiveScan },
        ...agent.extraScanDirs.map((root) => ({ root, recursive: false })),
      ];
      for (const { root, recursive } of globalRoots) {
        const path = otherCopy(skill, copiesAt(root, recursive));
        if (path) add({ where: "global", ...who, path });
      }
      // Only agent folders of a project: a linked workspace is one folder and nothing else.
      if (!target || !target.relativeDir) continue;
      for (const relative of agent.projectExtraScanDirs) {
        if (relative === target.relativeDir) continue;
        const path = otherCopy(skill, copiesAt(join(projectPath, relative), false));
        if (path) add({ where: "shared_folder", ...who, path });
      }
    }
    return addDuplicates(skill, found);
  });
}
