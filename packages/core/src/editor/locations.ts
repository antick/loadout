import { existsSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import type { EditTarget, InstructionFile, Skill, SkillCopy, SkillLocation } from "@loadout/shared";
import type { AgentRegistry } from "../agents/registry";
import type { CoreContext } from "../context";
import { invalid, notFound, unsupported } from "../errors";
import type { InstructionFinder, InstructionLocation } from "../instructions/finder";
import type { ProjectRecord, ProjectStore } from "../projects/store";
import { findVariants } from "../projects/scan";
import { findTarget, resolveTargets } from "../projects/targets";
import type { SkillStore } from "../skills/store";
import { readSkillIdentity } from "../skills/metadata";
import { canonicalPath, isInside, lstatOrNull, segmentsOf, targetIdentity } from "../util/fs";
import { requireLocalSkillDir } from "../workspace/local-actions";
import { describeLocalSkill, indexLibrary, matchLibrarySkill } from "../workspace/local-scan";
import type { EditableFolder } from "./files";
import { projectHistoryPrefix } from "./history";
import { PLACE_SEPARATOR } from "../util/text";
import { LIBRARY_PLACE } from "@loadout/shared";

/** A skill folder the editor works on, with everything a save needs to know about it. */
export interface ResolvedLocation {
  location: SkillLocation;
  folder: EditableFolder;
  /** Set for library skills: saves update its row, edit marks and deployed copies. */
  librarySkill: Skill | null;
  /**
   * What the editor shows it as. Which library skill a copy outside the library belongs to is
   * left out: finding it hashes the folder, so only `describeTarget` does that, when asked.
   */
  target: Omit<EditTarget, "librarySkillId">;
  /** The project's other copies of this skill (project copies only). */
  otherCopies: (SkillCopy & { folder: EditableFolder })[];
}

export interface LocationDeps {
  store: SkillStore;
  registry: AgentRegistry;
  projects: ProjectStore;
  instructions: InstructionFinder;
}

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
      placeLabel: LIBRARY_PLACE,
      otherCopies: [],
    },
  };
}

/**
 * An instruction file that does not exist yet opens as a new one, unless nothing could be saved
 * there: a link to a missing file, something that is not a file, or a project folder that is gone
 * (never brought back by a save).
 */
function requireCreatable(file: InstructionFile, project: ProjectRecord | null): void {
  if (file.linkTarget !== null) {
    throw unsupported(`${file.path} links to ${file.linkTarget}, which does not exist`);
  }
  if (lstatOrNull(file.path)) throw invalid(`${file.path} is not a file`);
  if (project && !existsSync(project.path)) {
    throw notFound(`The project folder is missing: ${project.path}`);
  }
}

export interface LocationResolver {
  /** Where a location is, read from disk once: call it once per operation. */
  resolve(location: SkillLocation): ResolvedLocation;
  /** The full target, with the library skill a copy outside the library belongs to. */
  describeTarget(resolved: ResolvedLocation): EditTarget;
}

export function createLocationResolver(ctx: CoreContext, deps: LocationDeps): LocationResolver {
  const { store, registry, projects, instructions } = deps;

  /**
   * A folder that is really the library's (a deployed link): edit it as the library skill. A
   * library skill's folder sits right in the skills folder, so only that one row is looked up.
   */
  function libraryBehind(dir: string): Skill | null {
    const real = canonicalPath(dir);
    const skillsDir = canonicalPath(ctx.paths.skillsDir);
    if (!isInside(skillsDir, real) || real === skillsDir) return null;
    const [dirName] = segmentsOf(relative(skillsDir, real));
    if (!dirName) return null;
    const skill = store.findByLibraryPath(join(ctx.paths.skillsDir, dirName));
    return skill && canonicalPath(skill.libraryPath) === real ? skill : null;
  }

  function matchedSkillId(dir: string): string | null {
    const entry = describeLocalSkill({ path: dir, relativePath: basename(dir) });
    const index = indexLibrary(store.list(), store.deployments());
    return matchLibrarySkill(entry, index, "loose")?.id ?? null;
  }

  function agentCopy(agentKey: string, relativePath: string): ResolvedLocation {
    const agent = registry.get(agentKey);
    const entry = requireLocalSkillDir(agent.skillsDir, relativePath);
    const linked = libraryBehind(entry.path);
    if (linked) return library(linked);
    const { name } = readSkillIdentity(entry.path);
    const location: SkillLocation = { kind: "agent", agentKey, relativePath: entry.relativePath };
    return {
      location,
      folder: {
        dir: entry.path,
        label: name,
        historyKey: `agent:${agentKey}:${entry.relativePath}`,
      },
      librarySkill: null,
      otherCopies: [],
      target: {
        location,
        name,
        folderName: basename(entry.path),
        path: entry.path,
        placeLabel: agent.displayName,
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

    const { name } = readSkillIdentity(chosen.path);
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
          historyKey: `${projectHistoryPrefix(project.id)}${variant.target.key}:${variant.relativePath}`,
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
        historyKey: `${projectHistoryPrefix(project.id)}${owner.key}:${chosen.relativePath}`,
      },
      librarySkill: null,
      otherCopies,
      target: {
        location,
        name,
        folderName: basename(chosen.path),
        path: chosen.path,
        placeLabel,
        otherCopies: otherCopies.map(({ agentKey: key, agentName }) => ({
          agentKey: key,
          agentName,
        })),
      },
    };
  }

  /**
   * An agent's instruction file: its folder, limited to that one file. Links are followed. A file
   * that does not exist yet reads as empty, and its first save creates it.
   */
  function instructionFile(location: InstructionLocation): ResolvedLocation {
    const file = instructions.find(location);
    const project = instructions.projectOf(location);
    if (!file.exists) requireCreatable(file, project);
    const real = file.exists ? canonicalPath(file.path) : targetIdentity(file.path);
    const readers = file.readers.map((reader) => reader.agentName).join(", ");
    const placeLabel = project ? `${project.name}${PLACE_SEPARATOR}${readers}` : readers;
    return {
      location,
      folder: {
        dir: dirname(real),
        label: file.name,
        historyKey: `instructions:${real}`,
        only: basename(real),
        creatable: !file.exists,
      },
      librarySkill: null,
      otherCopies: [],
      target: {
        location,
        name: file.name,
        folderName: file.name,
        path: file.path,
        placeLabel,
        otherCopies: [],
      },
    };
  }

  function resolve(location: SkillLocation): ResolvedLocation {
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
  }

  function describeTarget(resolved: ResolvedLocation): EditTarget {
    const { kind } = resolved.location;
    const librarySkillId =
      resolved.librarySkill?.id ??
      (kind === "agent" || kind === "project" ? matchedSkillId(resolved.folder.dir) : null);
    return { ...resolved.target, librarySkillId };
  }

  return { resolve, describeTarget };
}
