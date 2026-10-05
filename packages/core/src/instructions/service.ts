import type { InstructionsApi } from "@loadout/shared";
import type { CoreContext } from "../context";
import type { InstructionFinder } from "./finder";

export interface InstructionsServiceDeps {
  finder: InstructionFinder;
}

export interface InstructionsService {
  api: InstructionsApi;
}

/**
 * Lists the agents' instruction files. Editing goes through `editor`, which also opens a file
 * that does not exist yet and creates it on its first save.
 */
export function createInstructionsService(
  _ctx: CoreContext,
  deps: InstructionsServiceDeps,
): InstructionsService {
  const { finder } = deps;

  const api: InstructionsApi = {
    list: async (projectId) => finder.list(projectId ?? null),
  };

  return { api };
}
