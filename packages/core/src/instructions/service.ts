import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { InstructionsApi } from "@loadout/shared";
import type { CoreContext } from "../context";
import { invalid, notFound, unsupported } from "../errors";
import { lstatOrNull } from "../util/fs";
import type { InstructionFinder } from "./finder";

export interface InstructionsServiceDeps {
  finder: InstructionFinder;
}

export interface InstructionsService {
  api: InstructionsApi;
}

/** Lists the agents' instruction files and creates missing ones. Editing goes through `editor`. */
export function createInstructionsService(
  ctx: CoreContext,
  deps: InstructionsServiceDeps,
): InstructionsService {
  const { finder } = deps;

  const api: InstructionsApi = {
    list: async (projectId) => finder.list(projectId ?? null),

    create: async (location) => {
      if (location?.kind !== "instructions") throw invalid("Not an instruction file location");
      const file = finder.find(location);
      if (file.exists) return file;
      if (file.linkTarget !== null) {
        throw unsupported(`${file.path} links to ${file.linkTarget}, which does not exist`);
      }
      if (lstatOrNull(file.path)) throw invalid(`${file.path} is not a file`);
      const project = finder.projectOf(location);
      // Never bring back a project folder that was moved or deleted.
      if (project && !existsSync(project.path)) {
        throw notFound(`The project folder is missing: ${project.path}`);
      }
      mkdirSync(dirname(file.path), { recursive: true });
      writeFileSync(file.path, "", { flag: "wx" });
      ctx.activity.record("edit", file.name, `Created ${file.path}`);
      ctx.touched(project ? "projects" : "agents");
      return finder.find(location);
    },
  };

  return { api };
}
