import { dirname, join } from "node:path";
import {
  BUILT_IN_AGENTS,
  type ItemKind,
  type ItemPlace,
  type ItemPlaceRef,
  type ItemTarget,
  itemTargetFor,
  itemTargetsOf,
} from "@loadout/shared";
import { invalid, unsupported } from "../errors";
import type { AgentRegistry } from "../agents/registry";
import type { ProjectStore } from "../projects/store";

/** Where one item goes for one agent, global or in a project. */
export interface ResolvedPlace {
  target: ItemTarget;
  agentName: string;
  /** The folder the file goes in. */
  dir: string;
}

export interface ItemPlacement {
  places(kind: ItemKind): ItemPlace[];
  resolve(kind: ItemKind, place: ItemPlaceRef): ResolvedPlace;
  /** The file an item of this name gets in that folder. */
  fileName(target: ItemTarget, name: string): string;
}

/**
 * Resolves agent folders for items. An agent's own folder is the one its skills folder sits in
 * (`~/.claude` for `~/.claude/skills`), taken from its documented location and its home folder
 * variable, never from a skills folder chosen in Settings, which can be anywhere.
 */
export function createItemPlacement(deps: {
  registry: AgentRegistry;
  projects: ProjectStore;
}): ItemPlacement {
  const { registry, projects } = deps;

  const agentFolder = (agentKey: string): string | null => {
    const definition = BUILT_IN_AGENTS.find((agent) => agent.key === agentKey);
    const agent = registry.find(agentKey);
    if (!definition || !agent) return null;
    if (agent.homeEnv && definition.homeEnv) {
      return join(agent.homeEnv.value, dirname(definition.homeEnv.skillsDir));
    }
    return registry.homePath(dirname(definition.skillsDir));
  };

  const places = (kind: ItemKind): ItemPlace[] =>
    itemTargetsOf(kind).flatMap((target) => {
      const agent = registry.find(target.agentKey);
      if (!agent?.enabled) return [];
      const folder = agentFolder(target.agentKey);
      return [
        {
          agentKey: target.agentKey,
          agentName: agent.displayName,
          installed: agent.installed,
          globalDir: target.globalDir && folder ? join(folder, target.globalDir) : null,
          projectDir: target.projectDir ?? null,
          extension: target.extension,
        },
      ];
    });

  return {
    places,
    fileName: (target, name) => `${name}${target.extension}`,
    resolve(kind, place) {
      const target = itemTargetFor(kind, place.agentKey);
      const agent = registry.find(place.agentKey);
      if (!target || !agent) {
        throw unsupported(`${agent?.displayName ?? place.agentKey} does not read ${kind}s.`);
      }
      if (place.projectId === null) {
        const folder = agentFolder(place.agentKey);
        if (!target.globalDir || !folder) {
          throw unsupported(`${agent.displayName} reads ${kind}s only inside projects.`);
        }
        return { target, agentName: agent.displayName, dir: join(folder, target.globalDir) };
      }
      if (!target.projectDir) {
        throw unsupported(`${agent.displayName} reads ${kind}s only from its own folder.`);
      }
      const project = projects.find(place.projectId);
      if (!project) throw invalid(`No linked project with the id ${place.projectId}.`);
      // A linked workspace is a skills folder on its own, with no project root to write into.
      if (project.type !== "project") throw unsupported(`${project.name} is not a project folder.`);
      return {
        target,
        agentName: agent.displayName,
        dir: join(project.path, ...target.projectDir.split("/")),
      };
    },
  };
}
