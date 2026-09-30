import {
  CLAWHUB_NAME,
  MARKETPLACE_NAME,
  MARKET_PROVIDERS,
  MARKET_SEARCH_DEFAULT_LIMIT,
  type MarketProvider,
  formatCount,
  formatDateTime,
} from "@loadout/shared";
import { UsageError, flagInteger, flagString } from "../args";
import { table } from "../output";
import { positionalsFrom } from "./support";
import type { CommandContext, CommandResult, CommandSpec } from "./types";

const LIMIT_FLAG = {
  name: "limit",
  type: "string",
  value: "n",
  description: `How many results to list (default ${MARKET_SEARCH_DEFAULT_LIMIT}).`,
} as const;

const ON_FLAG = {
  name: "on",
  type: "string",
  value: "marketplace",
  description: `Which marketplace to search: ${MARKET_PROVIDERS.join(" or ")} (default skills_sh).`,
} as const;

const PROVIDER_NAMES: Record<MarketProvider, string> = {
  skills_sh: MARKETPLACE_NAME,
  clawhub: CLAWHUB_NAME,
};

/** Search a marketplace; installing what it finds stays a separate, explicit command. */
async function search({ core, args }: CommandContext): Promise<CommandResult> {
  const query = positionalsFrom(args, 0, "search words").join(" ");
  const on = flagString(args, ON_FLAG.name) ?? "skills_sh";
  const provider = MARKET_PROVIDERS.find((entry) => entry === on);
  if (!provider) throw new UsageError(`--on must be one of: ${MARKET_PROVIDERS.join(", ")}.`);
  const name = PROVIDER_NAMES[provider];
  const listing = await core.api.market.search(query, flagInteger(args, LIMIT_FLAG.name), provider);
  const rows = listing.skills.map((skill) => [
    provider === "clawhub"
      ? `@${skill.source}/${skill.skillId}`
      : `${skill.source}@${skill.skillId}`,
    skill.version ?? "",
    formatCount(skill.installs),
    skill.installed ? "in library" : "",
  ]);
  const lines = [
    table(["skill", "version", "installs", ""], rows, `No skills on ${name} match "${query}".`),
  ];
  if (listing.cachedAt !== null) {
    lines.push(
      "",
      `${name} could not be reached. This is an earlier answer from ${formatDateTime(listing.cachedAt)}.`,
    );
  }
  if (listing.skills.some((skill) => !skill.installed)) {
    lines.push("", "Install one with: skills install <skill>");
  }
  return { value: listing, text: lines.join("\n") };
}

export const searchCommand: CommandSpec = {
  name: "search",
  summary: `Search ${MARKETPLACE_NAME} or ${CLAWHUB_NAME} for skills to install`,
  usage: "<words…> [--limit <n>] [--on <marketplace>]",
  flags: [LIMIT_FLAG, ON_FLAG],
  notes: [
    "Lists owner/repo@skill names (skills.sh) or @owner/slug names (ClawHub) in the marketplace's order. Nothing is installed or changed.",
    "Works from the last answer when offline, and says so.",
  ],
  run: search,
};
