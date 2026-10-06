import { errorMessage, previewLibrary } from "@loadout/core";
import {
  type BatchFailure,
  CLAWHUB_NAME,
  MARKETPLACE_NAME,
  MARKET_PROVIDER_NAMES,
  MARKET_PROVIDERS,
  MARKET_SEARCH_DEFAULT_LIMIT,
  type MarketListing,
  type MarketProvider,
  type MarketSkill,
  type RepoSkillPreview,
  type Skill,
  formatCount,
  formatDateTime,
} from "@loadout/shared";
import { UsageError, flagBoolean, flagChoice, flagInteger } from "../args";
import { failureLines, plural, table } from "../output";
import { NOT_DEPLOYED_HINT } from "./skills-install";
import { ACCEPT_RISK_FLAG, positionalsFrom } from "./support";
import type { CommandContext, CommandResult, CommandSpec } from "./types";
import { exitCodeFor } from "../exit-codes";

const LIMIT_FLAG = {
  name: "limit",
  type: "string",
  value: "n",
  description: `How many results to list (default ${MARKET_SEARCH_DEFAULT_LIMIT}).`,
} as const;

const DEFAULT_PROVIDER: MarketProvider = "skills_sh";

const ON_FLAG = {
  name: "on",
  type: "string",
  value: "marketplace",
  description: `Which marketplace to search: ${MARKET_PROVIDERS.join(" or ")} (default ${DEFAULT_PROVIDER}).`,
} as const;

/** The name `skills install` takes for a marketplace skill. */
function installRef(skill: MarketSkill): string {
  return skill.provider === "clawhub"
    ? `@${skill.source}/${skill.skillId}`
    : `${skill.source}@${skill.skillId}`;
}

/**
 * A search result as a picker row. The path puts it under its repository (skills.sh) or
 * publisher (ClawHub), so results from several sources show in groups. Scripts, hooks and the
 * like are unknown until the skill is fetched; the safety check runs on install.
 */
function pickerRow(skill: MarketSkill): RepoSkillPreview {
  const owner = skill.provider === "clawhub" ? `@${skill.source}` : skill.source;
  return {
    relPath: `${owner}/${skill.skillId}`,
    name: skill.skillId,
    description: [`${formatCount(skill.installs)} installs`, skill.summary]
      .filter(Boolean)
      .join(" · "),
    manualOnly: false,
    traits: [],
    alreadyInstalled: false,
  };
}

interface PickedInstall {
  installed: Skill[];
  failed: BatchFailure[];
}

/**
 * In a terminal, tick results to install. Null when there is nothing new to pick or the person
 * cancelled: the plain listing is printed then, as without a terminal.
 */
async function pickAndInstall(
  context: CommandContext,
  listing: MarketListing,
  source: string,
): Promise<PickedInstall | null> {
  const { core, args, picker } = context;
  const fresh = listing.skills.filter((skill) => !skill.installed);
  if (!picker || fresh.length === 0) return null;
  const rows = new Map(fresh.map((skill) => [pickerRow(skill).relPath, skill]));
  const keys = await picker({
    source,
    skills: fresh.map(pickerRow),
    library: previewLibrary(core.ctx, core.store, () => false),
    // Nothing starts ticked: a search result is a suggestion, not something asked for.
    selected: [],
  });
  if (!keys) return null;
  const acceptRisk = flagBoolean(args, ACCEPT_RISK_FLAG.name);
  // Accepting findings is a choice about one skill whose findings were read, never a batch.
  if (acceptRisk && keys.length > 1) {
    throw new UsageError(
      `--${ACCEPT_RISK_FLAG.name} works on one skill at a time: tick one, or install each with skills install <skill> --${ACCEPT_RISK_FLAG.name}.`,
    );
  }
  const result: PickedInstall = { installed: [], failed: [] };
  for (const skill of keys.flatMap((key) => rows.get(key) ?? [])) {
    try {
      result.installed.push(
        skill.provider === "clawhub"
          ? await core.api.install.fromClawhub(skill.source, skill.skillId, { acceptRisk })
          : await core.api.install.fromMarket(skill.source, skill.skillId, { acceptRisk }),
      );
    } catch (error) {
      result.failed.push({ name: installRef(skill), message: errorMessage(error) });
    }
  }
  return result;
}

function pickedText(picked: PickedInstall): string {
  const lines = [
    `Installed ${plural(picked.installed.length, "skill")} into the library.`,
    ...picked.installed.map((skill) => `  ${skill.name} (${skill.id})`),
    ...failureLines(picked.failed),
  ];
  if (picked.failed.length > 0) {
    lines.push("Try one again with: skills install <skill> (add --accept-risk for a flagged one)");
  }
  if (picked.installed.length > 0) lines.push(NOT_DEPLOYED_HINT);
  return lines.join("\n");
}

/**
 * Search a marketplace. In a terminal the results can be ticked and installed; without one (and
 * with --json) nothing is installed and installing stays a separate command.
 */
async function search(context: CommandContext): Promise<CommandResult> {
  const { core, args } = context;
  const query = positionalsFrom(args, 0, "search words").join(" ");
  // The flag acts on a skill ticked in the picker. Without one (no terminal, or --json) nothing
  // is installed, and a flag that does nothing must not look as if it was taken.
  if (!context.picker && flagBoolean(args, ACCEPT_RISK_FLAG.name)) {
    throw new UsageError(
      `--${ACCEPT_RISK_FLAG.name} needs the picker, which opens only in a terminal and never with --json. Install a flagged skill with: skills install <skill> --${ACCEPT_RISK_FLAG.name}`,
    );
  }
  const provider = flagChoice(args, ON_FLAG.name, MARKET_PROVIDERS) ?? DEFAULT_PROVIDER;
  const name = MARKET_PROVIDER_NAMES[provider];
  const listing = await core.api.market.search(query, flagInteger(args, LIMIT_FLAG.name), provider);
  const picked = await pickAndInstall(context, listing, `${name} results for "${query}"`);
  if (picked) {
    return {
      value: { ...listing, ...picked },
      text: pickedText(picked),
      exitCode: exitCodeFor(picked.failed.length > 0),
    };
  }
  const rows = listing.skills.map((skill) => [
    installRef(skill),
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
  usage: "<words…>",
  flags: [LIMIT_FLAG, ON_FLAG, ACCEPT_RISK_FLAG],
  notes: [
    "Lists owner/repo@skill names (skills.sh) or @owner/slug names (ClawHub) in the marketplace's order.",
    "In a terminal, results not in the library open in a picker: tick some and press enter to",
    "install them, or esc to only list them. Scripts and --json never see it and install nothing.",
    "Every skill is safety-checked on install (see skills install); --accept-risk installs a",
    "flagged one anyway, with one skill ticked only; without the picker it is refused.",
    "Works from the last answer when offline, and says so.",
  ],
  run: search,
};
