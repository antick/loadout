import {
  DEFAULT_LISTING_WINDOW,
  LISTING_AGENT_KEY,
  LISTING_WINDOW_CHOICES,
  LISTING_WINDOWS,
  type ListingBudgetSource,
  type SkillListingReport,
  formatNumber,
} from "@loadout/shared";
import { flagBoolean, flagChoice } from "../args";
import { plural, table } from "../output";
import { limitPositionals, showAllFlag } from "./support";
import type { CommandContext, CommandResult, CommandSpec } from "./types";

const ALL_FLAG = showAllFlag("List every skill, not only the biggest.");

const WINDOW_FLAG = {
  name: "window",
  type: "string",
  value: "window",
  choices: LISTING_WINDOW_CHOICES,
  description: `Context window to assume: ${LISTING_WINDOW_CHOICES.join(" or ")}. Default: the saved setting (${DEFAULT_LISTING_WINDOW}).`,
} as const;

/** Skills listed when `--all` is not given. */
const SHOWN = 10;

const BUDGET_NOTES: Record<ListingBudgetSource, (report: SkillListingReport) => string> = {
  default: (report) =>
    `1% of a ${formatNumber(LISTING_WINDOWS[report.window] / 1000)}K-token context window`,
  fraction: () => "from skillListingBudgetFraction in Claude Code's settings",
  characters: () => "from SLASH_COMMAND_TOOL_CHAR_BUDGET in Claude Code's settings",
};

const HIDDEN_NOTES = { frontmatter: "manual only", override: "hidden in settings" } as const;

function describeMode(entry: SkillListingReport["entries"][number]): string {
  if (entry.mode === "name_only") return "name only";
  if (entry.mode === "hidden") return entry.hiddenBy ? HIDDEN_NOTES[entry.hiddenBy] : "hidden";
  return entry.cut ? "description cut" : "";
}

function render(report: SkillListingReport, all: boolean): string {
  const lines = [
    `${report.agentName} skill listing (an estimate from its documented rules)`,
    `  budget: about ${formatNumber(report.budget)} characters (${BUDGET_NOTES[report.budgetSource](report)})`,
    `  used:   about ${formatNumber(report.used)} characters${
      report.over > 0 ? `, ${formatNumber(report.over)} over` : ""
    }`,
    `  skills: ${report.full} with a description, ${report.nameOnly} by name only, ${report.hidden} hidden from the model`,
  ];
  if (report.over > 0) {
    lines.push(
      "",
      `Over budget: ${report.agentName} cuts the descriptions of the skills used least. Shorten the biggest descriptions, or set disable-model-invocation: true on skills you call by name.`,
    );
  }
  const shown = all ? report.entries : report.entries.slice(0, SHOWN);
  lines.push(
    "",
    table(
      ["skill", "characters", "from", "note"],
      shown.map((entry) => [
        entry.name,
        formatNumber(entry.chars),
        entry.plugin ? `plugin ${entry.plugin}` : "folder",
        describeMode(entry),
      ]),
      "No skills.",
    ),
  );
  const rest = report.entries.length - shown.length;
  if (rest > 0) lines.push(`${plural(rest, "more skill")}. Run with --all to list them.`);
  return lines.join("\n");
}

async function listing({ core, args }: CommandContext): Promise<CommandResult> {
  limitPositionals(args, 0);
  const window = flagChoice(args, WINDOW_FLAG);
  const report = await core.api.listing.report(
    LISTING_AGENT_KEY,
    window === undefined ? undefined : { window },
  );
  if (!report) {
    return {
      value: null,
      text: "Claude Code was not found on this machine, so there is no skill listing to estimate.",
    };
  }
  return { value: report, text: render(report, flagBoolean(args, ALL_FLAG.name)) };
}

export const listingCommand: CommandSpec = {
  name: "listing",
  summary: "What Claude Code's skill listing costs, and whether it is over budget",
  usage: "",
  flags: [WINDOW_FLAG, ALL_FLAG],
  readOnly: true,
  notes: [
    "Claude Code puts every skill's name and description in the model's context and cuts descriptions past a budget of about 1% of the context window. This reads your skills, your plugins' skills and Claude Code's settings, and estimates the total. It assumes a 200k-token window; if you run a 1M-token model, add --window 1m.",
  ],
  run: listing,
};
