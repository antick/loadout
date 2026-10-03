import { type Core, canonicalPath, notFound } from "@loadout/core";
import {
  ITEM_KINDS,
  type ItemKind,
  type ItemPlaceRef,
  type ItemRef,
  type ItemWarning,
  isItemKind,
} from "@loadout/shared";
import { UsageError, flagChoice, flagList, flagString } from "../args";
import { resolveUserPath } from "./support";
import type { CommandContext } from "./types";

export const KIND_FLAG = {
  name: "kind",
  short: "k",
  type: "string",
  value: "kind",
  description: `Only this kind: ${ITEM_KINDS.join(", ")}.`,
} as const;

export const PROJECT_FLAG = {
  name: "project",
  short: "p",
  type: "string",
  value: "path",
  description: "A linked project's folder, instead of the agent's own folder.",
} as const;

export function kindFlag(context: Pick<CommandContext, "args">): ItemKind | undefined {
  return flagChoice(context.args, KIND_FLAG.name, ITEM_KINDS);
}

/**
 * `<kind>/<name>` (`subagent/reviewer`), or a bare name when only one item has it. The plural
 * folder names (`subagents/reviewer`) work too.
 */
export async function resolveItem(core: Core, ref: string): Promise<ItemRef> {
  const slash = ref.indexOf("/");
  if (slash !== -1) {
    const word = ref.slice(0, slash).replace(/s$/, "");
    const name = ref.slice(slash + 1);
    if (!isItemKind(word)) throw new UsageError(`Unknown kind "${ref.slice(0, slash)}".`);
    return { kind: word, name };
  }
  const matches = (await core.api.items.list()).filter((item) => item.name === ref);
  if (matches.length > 1) {
    throw new UsageError(
      `Several items are called ${ref}: ${matches.map((m) => `${m.kind}/${m.name}`).join(", ")}.`,
    );
  }
  const [item] = matches;
  if (!item) throw notFound(`No subagent, command or rule called ${ref}.`);
  return { kind: item.kind, name: item.name };
}

/**
 * The linked project whose folder is `--project`, or null for the agent's own folder. With
 * `link`, a folder that is not linked yet is linked, and `onLinked` hears about it.
 */
export async function projectFlag(
  context: CommandContext,
  options: { link?: boolean; onLinked?: (path: string) => void } = {},
): Promise<string | null> {
  const input = flagString(context.args, PROJECT_FLAG.name);
  if (input === undefined) return null;
  const path = canonicalPath(resolveUserPath(input, context.cwd, context.core.ctx.homeDir));
  const project = (await context.core.api.projects.list()).find(
    (candidate) => canonicalPath(candidate.path) === path,
  );
  if (project) return project.id;
  if (!options.link) {
    throw notFound(
      `${path} is not a linked project. Deploy something there first, or link it in the app.`,
    );
  }
  const linked = await context.core.api.projects.add(path);
  options.onLinked?.(linked.path);
  return linked.id;
}

/** One place per `--agent`, in the project given or the agents' own folders. */
export async function placesOf(
  context: CommandContext,
  agentFlag: string,
  options: Parameters<typeof projectFlag>[1] = {},
): Promise<ItemPlaceRef[]> {
  const agents = flagList(context.args, agentFlag);
  if (agents.length === 0) throw new UsageError("Give at least one --agent.");
  const projectId = await projectFlag(context, options);
  return agents.map((agentKey) => ({ agentKey, projectId }));
}

export const refText = (ref: ItemRef): string => `${ref.kind}/${ref.name}`;

export function warningLines(warnings: readonly ItemWarning[]): string[] {
  return warnings.map((warning) => `  note: ${warning.message}`);
}
