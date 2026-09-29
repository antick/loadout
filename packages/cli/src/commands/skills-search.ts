import {
  MARKETPLACE_NAME,
  MARKET_SEARCH_DEFAULT_LIMIT,
  formatCount,
  formatDateTime,
} from "@loadout/shared";
import { flagInteger } from "../args";
import { table } from "../output";
import { positionalsFrom } from "./support";
import type { CommandContext, CommandResult, CommandSpec } from "./types";

const LIMIT_FLAG = {
  name: "limit",
  type: "string",
  value: "n",
  description: `How many results to list (default ${MARKET_SEARCH_DEFAULT_LIMIT}).`,
} as const;

/** Search the marketplace; installing what it finds stays a separate, explicit command. */
async function search({ core, args }: CommandContext): Promise<CommandResult> {
  const query = positionalsFrom(args, 0, "search words").join(" ");
  const listing = await core.api.market.search(query, flagInteger(args, LIMIT_FLAG.name));
  const rows = listing.skills.map((skill) => [
    `${skill.source}@${skill.skillId}`,
    formatCount(skill.installs),
    skill.installed ? "in library" : "",
  ]);
  const lines = [
    table(["skill", "installs", ""], rows, `No skills on ${MARKETPLACE_NAME} match "${query}".`),
  ];
  if (listing.cachedAt !== null) {
    lines.push(
      "",
      `${MARKETPLACE_NAME} could not be reached. This is an earlier answer from ${formatDateTime(listing.cachedAt)}.`,
    );
  }
  if (listing.skills.some((skill) => !skill.installed)) {
    lines.push("", "Install one with: skills install <skill>");
  }
  return { value: listing, text: lines.join("\n") };
}

export const searchCommand: CommandSpec = {
  name: "search",
  summary: `Search ${MARKETPLACE_NAME} for skills to install`,
  usage: "<words…> [--limit <n>]",
  flags: [LIMIT_FLAG],
  notes: [
    "Lists owner/repo@skill names in the marketplace's order. Nothing is installed or changed.",
    "Works from the last answer when offline, and says so.",
  ],
  run: search,
};
