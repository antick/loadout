import { readlinkSync } from "node:fs";
import { basename, join } from "node:path";
import {
  AGENT_INSTRUCTION_FILES,
  type InstructionFile,
  type InstructionScope,
  type SkillLocation,
} from "@loadout/shared";
import type { AgentRegistry, ResolvedAgent } from "../agents/registry";
import { notFound, unsupported } from "../errors";
import type { ProjectRecord, ProjectStore } from "../projects/store";
import { canonicalPath, lstatOrNull, statOrNull } from "../util/fs";

export type InstructionLocation = Extract<SkillLocation, { kind: "instructions" }>;

export interface InstructionFinderDeps {
  registry: AgentRegistry;
  projects: ProjectStore;
}

/** Where a set of instruction files lives: the home folder, or one project. */
interface Place {
  scope: InstructionScope;
  project: ProjectRecord | null;
}

/** An agent paired with the absolute path it reads its instructions from. */
interface Reading {
  agent: ResolvedAgent;
  path: string;
}

/** What is on disk at an instruction path, and who reads it. */
function describeFile(path: string, readings: Reading[], place: Place): InstructionFile {
  const link = lstatOrNull(path);
  const target = statOrNull(path);
  const exists = Boolean(target?.isFile());
  return {
    scope: place.scope,
    projectId: place.project?.id ?? null,
    path,
    name: basename(path),
    exists,
    linkTarget: link?.isSymbolicLink() ? readlinkSync(path) : null,
    size: exists ? (target?.size ?? null) : null,
    modifiedAt: exists ? (target?.mtimeMs ?? null) : null,
    readers: readings.map(({ agent }) => ({
      agentKey: agent.key,
      agentName: agent.displayName,
    })),
  };
}

/**
 * Finds the instruction files agents read, in the home folder or a project, and merges the
 * agents that read one file into one entry: the same path, or paths linked to the same file.
 */
export function createInstructionFinder(deps: InstructionFinderDeps) {
  const { registry, projects } = deps;

  function placeOf(projectId: string | null): Place {
    if (projectId === null) return { scope: "global", project: null };
    const project = projects.get(projectId);
    if (project.type !== "project") {
      throw unsupported(`${project.name} is a linked folder, so it has no instruction files`);
    }
    return { scope: "project", project };
  }

  function pathOf(agent: ResolvedAgent, place: Place): string | null {
    const relative = AGENT_INSTRUCTION_FILES[agent.key]?.[place.scope];
    if (!relative) return null;
    return place.project ? join(place.project.path, relative) : registry.homePath(relative);
  }

  /** One entry per distinct file, read by the available agents plus `include`. */
  function collect(place: Place, include: string | null = null): InstructionFile[] {
    const groups = new Map<string, Reading[]>();
    for (const agent of registry.list()) {
      const wanted = (agent.installed && agent.enabled) || agent.key === include;
      const path = wanted ? pathOf(agent, place) : null;
      if (!path) continue;
      const identity = canonicalPath(path);
      groups.set(identity, [...(groups.get(identity) ?? []), { agent, path }]);
    }
    return [...groups.values()].map((readings) =>
      describeFile((readings[0] as Reading).path, readings, place),
    );
  }

  return {
    list(projectId: string | null): InstructionFile[] {
      return collect(placeOf(projectId));
    },

    /** The file a location points at, with every agent that reads it. */
    find(location: InstructionLocation): InstructionFile {
      const agent = registry.get(location.agentKey);
      const place = placeOf(location.projectId);
      if (!pathOf(agent, place)) {
        throw notFound(`${agent.displayName} has no ${place.scope} instruction file`);
      }
      const found = collect(place, agent.key).find((file) =>
        file.readers.some((reader) => reader.agentKey === agent.key),
      );
      if (!found) throw notFound(`${agent.displayName} has no ${place.scope} instruction file`);
      return found;
    },

    /** The project a location belongs to, or null for a global file. */
    projectOf(location: InstructionLocation): ProjectRecord | null {
      return placeOf(location.projectId).project;
    },
  };
}

export type InstructionFinder = ReturnType<typeof createInstructionFinder>;
