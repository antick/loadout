import { basename, dirname } from "node:path";
import type { EditTarget, Skill, SkillCopy, SkillLocation } from "@loadout/shared";
import type { AgentRegistry } from "../agents/registry";
import type { CoreContext } from "../context";
import { invalid, notFound } from "../errors";
import type { InstructionFinder, InstructionLocation } from "../instructions/finder";
import type { ProjectStore } from "../projects/store";
import { findVariants } from "../projects/scan";
import { findTarget, resolveTargets } from "../projects/targets";
import type { SkillStore } from "../skills/store";
import { canonicalPath, isInside } from "../util/fs";
import { requireLocalSkill } from "../workspace/local-actions";
import { describeLocalSkill, indexLibrary, matchLibrarySkill } from "../workspace/local-scan";
import type { EditableFolder } from "./files";

/** A skill folder the editor works on, with everything a save needs to know about it. */
export interface ResolvedLocation {
  location: SkillLocation;
  folder: EditableFolder;
  /** Set for library skills: saves update its row, edit marks and deployed copies. */
  librarySkill: Skill | null;
  target: EditTarget;
  /** The project's other copies of this skill (project copies only). */
  otherCopies: (SkillCopy & { folder: EditableFolder })[];
}

export interface LocationDeps {
  store: SkillStore;
  registry: AgentRegistry;
  projects: ProjectStore;
  instructions: InstructionFinder;
}

const LIBRARY_LABEL = "Library";
const PLACE_SEPARATOR = " · ";

export function createLocationResolver(ctx: CoreContext, deps: LocationDeps) {
  const { store, registry, projects, instructions } = deps;

  function library(skill: Skill): ResolvedLocation {
    return {
      location: { kind: "library", skillId: skill.id },
      folder: { dir: skill.libraryPath, label: skill.name, historyKey: skill.id },
      librarySkill: skill,
      otherCopies: [],
      target: {
        location: { kind: "library", skillId: skill.id },
        name: skill.name,
        folderName: skill.dirName,
        path: skill.libraryPath,
        placeLabel: LIBRARY_LABEL,
        librarySkillId: skill.id,
        otherCopies: [],
      },
    };
  }

  /** A folder that is really the library's (a deployed link): edit it as the library skill. */
  function libraryBehind(dir: string): Skill | null {
    const real = canonicalPath(dir);
    if (!isInside(canonicalPath(ctx.paths.skillsDir), real)) return null;
    return store.list().find((skill) => canonicalPath(skill.libraryPath) === real) ?? null;
  }

  function matchedSkillId(dir: string): string | null {
    const entry = describeLocalSkill({ path: dir, relativePath: basename(dir) });
    const index = indexLibrary(store.list(), store.deployments());
    return matchLibrarySkill(entry, index, "loose")?.id ?? null;
  }

  function agentCopy(agentKey: string, relativePath: string): ResolvedLocation {
    const agent = registry.get(agentKey);
    const entry = requireLocalSkill(agent.skillsDir, relativePath);
    const linked = libraryBehind(entry.path);
    if (linked) return library(linked);
    const location: SkillLocation = { kind: "agent", agentKey, relativePath: entry.relativePath };
    return {
      location,
      folder: {
        dir: entry.path,
        label: entry.name,
        historyKey: `agent:${agentKey}:${entry.relativePath}`,
      },
      librarySkill: null,
      otherCopies: [],
      target: {
        location,
        name: entry.name,
        folderName: basename(entry.path),
        path: entry.path,
        placeLabel: agent.displayName,
        librarySkillId: matchedSkillId(entry.path),
        otherCopies: [],
      },
    };
  }

  function projectCopy(
    projectId: string,
    relativePath: string,
    agentKey: string,
  ): ResolvedLocation {
    const project = projects.get(projectId);
    const targets = resolveTargets(project, registry);
    const owner = findTarget(targets, agentKey);
    if (!owner) throw notFound(`Unknown agent for this workspace: ${agentKey}`);
    const variants = findVariants(targets, relativePath);
    const chosen =
      variants.find((v) => v.target.key === owner.key && v.relativePath === relativePath) ??
      variants.find((v) => v.target.key === owner.key);
    if (!chosen) throw notFound(`No skill found at ${relativePath} for ${owner.displayName}`);
    const linked = libraryBehind(chosen.path);
    if (linked) return library(linked);

    const entry = describeLocalSkill({ path: chosen.path, relativePath: chosen.relativePath });
    const seen = new Set([canonicalPath(chosen.path)]);
    const otherCopies: ResolvedLocation["otherCopies"] = [];
    for (const variant of variants) {
      const real = canonicalPath(variant.path);
      // Agents sharing one folder hold one copy; a link into the library is not a project copy.
      if (seen.has(real) || libraryBehind(variant.path)) continue;
      seen.add(real);
      otherCopies.push({
        agentKey: variant.target.key,
        agentName: variant.target.displayName,
        folder: {
          dir: variant.path,
          label: `${project.name}${PLACE_SEPARATOR}${variant.target.displayName}`,
          historyKey: `project:${project.id}:${variant.target.key}:${variant.relativePath}`,
        },
      });
    }
    const location: SkillLocation = {
      kind: "project",
      projectId: project.id,
      relativePath: chosen.relativePath,
      agentKey: owner.key,
    };
    const placeLabel = `${project.name}${PLACE_SEPARATOR}${owner.displayName}`;
    return {
      location,
      folder: {
        dir: chosen.path,
        label: placeLabel,
        historyKey: `project:${project.id}:${owner.key}:${chosen.relativePath}`,
      },
      librarySkill: null,
      otherCopies,
      target: {
        location,
        name: entry.name,
        folderName: basename(chosen.path),
        path: chosen.path,
        placeLabel,
        librarySkillId: matchedSkillId(chosen.path),
        otherCopies: otherCopies.map(({ agentKey: key, agentName }) => ({
          agentKey: key,
          agentName,
        })),
      },
    };
  }

  /** An agent's instruction file: its folder, limited to that one file. Links are followed. */
  function instructionFile(location: InstructionLocation): ResolvedLocation {
    const file = instructions.find(location);
    if (!file.exists) throw notFound(`${file.path} does not exist yet`);
    const real = canonicalPath(file.path);
    const project = instructions.projectOf(location);
    const readers = file.readers.map((reader) => reader.agentName).join(", ");
    const placeLabel = project ? `${project.name}${PLACE_SEPARATOR}${readers}` : readers;
    return {
      location,
      folder: {
        dir: dirname(real),
        label: file.name,
        historyKey: `instructions:${real}`,
        only: basename(real),
      },
      librarySkill: null,
      otherCopies: [],
      target: {
        location,
        name: file.name,
        folderName: file.name,
        path: file.path,
        placeLabel,
        librarySkillId: null,
        otherCopies: [],
      },
    };
  }

  return function resolve(location: SkillLocation): ResolvedLocation {
    switch (location?.kind) {
      case "library":
        return library(store.get(location.skillId));
      case "agent":
        return agentCopy(location.agentKey, location.relativePath);
      case "project":
        return projectCopy(location.projectId, location.relativePath, location.agentKey);
      case "instructions":
        return instructionFile(location);
      default:
        throw invalid("Unknown skill location");
    }
  };
}
