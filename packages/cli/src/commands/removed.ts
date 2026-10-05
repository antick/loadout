import { notFound } from "@loadout/core";
import {
  REMOVED_KEEP_DAYS,
  type RemovedFolder,
  formatBytes,
  formatDateTime,
} from "@loadout/shared";
import { UsageError, flagBoolean } from "../args";
import { table } from "../output";
import {
  DRY_RUN_FLAG,
  REQUIRED_YES_FLAG,
  limitPositionals,
  positional,
  requireYes,
} from "./support";
import type { CommandContext, CommandGroup, CommandResult } from "./types";

/** Shortest id prefix accepted, and the length `list` prints: like a short git hash. */
const SHORT_ID_LENGTH = 8;

const shortId = (id: string): string => id.slice(0, SHORT_ID_LENGTH);

/** An entry by its full id or an unambiguous prefix of at least `SHORT_ID_LENGTH` characters. */
async function findEntry({ core, args }: CommandContext): Promise<RemovedFolder> {
  const ref = positional(args, 0, "an entry id from `removed list`").toLowerCase();
  limitPositionals(args, 1);
  if (ref.length < SHORT_ID_LENGTH) {
    throw new UsageError(`Give at least ${SHORT_ID_LENGTH} characters of the id.`);
  }
  const matches = (await core.api.storage.removed()).filter((entry) => entry.id.startsWith(ref));
  if (matches.length > 1)
    throw notFound(`More than one entry starts with ${ref}: give more of it.`);
  const [entry] = matches;
  if (!entry) throw notFound(`Nothing in Recently removed has the id ${ref}.`);
  return entry;
}

async function list({ core, args }: CommandContext): Promise<CommandResult> {
  limitPositionals(args, 0);
  const entries = await core.api.storage.removed();
  const text = table(
    ["id", "name", "from", "reason", "removed", "size", "path"],
    entries.map((entry) => [
      shortId(entry.id),
      entry.name,
      entry.place,
      entry.reason,
      formatDateTime(entry.removedAt),
      formatBytes(entry.bytes),
      entry.originalPath,
    ]),
    `Nothing in Recently removed. Deleted skills and replaced folders wait here for ${REMOVED_KEEP_DAYS} days.`,
  );
  return { value: entries, text };
}

async function restore(context: CommandContext): Promise<CommandResult> {
  const entry = await findEntry(context);
  if (entry.parentMissing) {
    throw notFound(`The folder it came from is gone: ${entry.originalPath}`);
  }
  const result = await context.core.api.storage.restoreRemoved(entry.id);
  const lines = [`Put ${entry.name} back: ${result.path}`];
  if (entry.library) lines.push("It is in the library again. Deploy it to agents again if needed.");
  if (result.displacedId) {
    lines.push(`What was there is now in Recently removed as ${shortId(result.displacedId)}.`);
  }
  return { value: result, text: lines.join("\n") };
}

async function remove(context: CommandContext): Promise<CommandResult> {
  const entry = await findEntry(context);
  requireYes(context.args, `delete ${entry.name} from Recently removed for good`);
  if (flagBoolean(context.args, DRY_RUN_FLAG.name)) {
    return {
      value: { dryRun: true, entry },
      text: `Would delete ${entry.name} (${formatBytes(entry.bytes)}) for good. Nothing was changed.`,
    };
  }
  await context.core.api.storage.deleteRemoved(entry.id);
  return {
    value: { dryRun: false, entry, deleted: entry.id },
    text: `Deleted ${entry.name} for good.`,
  };
}

export const removedGroup: CommandGroup = {
  name: "removed",
  summary: `Skills and folders deleted or replaced in the last ${REMOVED_KEEP_DAYS} days`,
  commands: [
    {
      name: "list",
      summary: "List what can be put back, newest first",
      usage: "",
      flags: [],
      notes: [
        `Deleted library skills, and skill folders taken out of agent and project folders, are kept for ${REMOVED_KEEP_DAYS} days.`,
      ],
      run: list,
    },
    {
      name: "restore",
      summary: "Put one back where it came from",
      usage: "<id>",
      flags: [],
      notes: [
        `<id> is the id from \`removed list\`, or its first ${SHORT_ID_LENGTH} or more characters.`,
        "A library skill comes back with its tags and presets, but is not deployed again.",
        "Anything else now at its old place is itself kept in Recently removed first.",
      ],
      run: restore,
    },
    {
      name: "delete",
      summary: "Delete one for good",
      usage: "<id>",
      flags: [DRY_RUN_FLAG, REQUIRED_YES_FLAG],
      run: remove,
    },
  ],
};
