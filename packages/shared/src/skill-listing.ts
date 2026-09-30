/**
 * What an agent's skill listing costs. Claude Code puts every skill's name and description in
 * the model's context on every turn, and keeps that listing inside a character budget of about
 * 1% of the context window. Past it, descriptions of the skills used least are dropped, and the
 * words that make the right skill start are the first thing lost. This is an estimate from the
 * documented rules, not a reading of the running agent, so it says "about" everywhere.
 */

/** Claude Code's rule: the listing may take this share of the context window... */
export const LISTING_BUDGET_FRACTION = 0.01;
/** ...counted in characters, at roughly this many characters per token. */
export const LISTING_CHARS_PER_TOKEN = 4;
/** Each entry's description text is cut at this many characters, whatever the budget. */
export const LISTING_MAX_DESCRIPTION_CHARS = 1536;
/** Characters an entry adds around its text: the list dash, the colon, spaces and line break. */
export const LISTING_ENTRY_OVERHEAD = 4;

/** Context windows the estimate can assume, in tokens. */
export const LISTING_WINDOWS = { "200k": 200_000, "1m": 1_000_000 } as const;
export type ListingWindow = keyof typeof LISTING_WINDOWS;
export const LISTING_WINDOW_CHOICES = Object.keys(LISTING_WINDOWS) as ListingWindow[];
export const DEFAULT_LISTING_WINDOW: ListingWindow = "200k";

/** The agent this estimate is made for; other agents document no listing budget. */
export const LISTING_AGENT_KEY = "claude_code";

/**
 * How the agent lists a skill. `full`: name and description. `name_only`: name alone.
 * `hidden`: not listed, so the model cannot pick it on its own (a person can still call it).
 */
export type ListingMode = "full" | "name_only" | "hidden";

/** Why a skill is `hidden`: its own `disable-model-invocation`, or a `skillOverrides` entry. */
export type ListingHiddenBy = "frontmatter" | "override";

/** Where the budget came from: the documented default, or a value the user set in Claude Code. */
export type ListingBudgetSource = "default" | "fraction" | "characters";

export interface ListingEntry {
  name: string;
  /** Folder of the skill. */
  path: string;
  /** `folder`: the agent's own skills folder. `plugin`: brought by a plugin. */
  origin: "folder" | "plugin";
  /** The plugin's name, for `plugin`. */
  plugin?: string;
  mode: ListingMode;
  hiddenBy?: ListingHiddenBy;
  /** About how many characters it adds to the listing; 0 when hidden. */
  chars: number;
  /** Its description was longer than the per-entry cap, so the agent cuts it. */
  cut: boolean;
}

export interface SkillListingReport {
  agentKey: string;
  agentName: string;
  /** About how many characters the agent lets the listing take. */
  budget: number;
  budgetSource: ListingBudgetSource;
  /** The context window the budget was worked out for. */
  window: ListingWindow;
  /** About how many characters the listing takes. */
  used: number;
  /** How far past the budget it is; 0 when it fits. */
  over: number;
  /** Skills listed with a description. */
  full: number;
  /** Skills listed by name only. */
  nameOnly: number;
  /** Skills the model is not shown at all. */
  hidden: number;
  /** Listed skills first, biggest first; hidden ones last. */
  entries: ListingEntry[];
}

/** One skill's raw material: what the agent reads from its `SKILL.md` and settings. */
export interface ListingSkillInput {
  name: string;
  path: string;
  origin: "folder" | "plugin";
  plugin?: string;
  /** `description`, or the first line of the document when there is none. */
  description: string;
  /** `when_to_use`, appended to the description. */
  whenToUse: string;
  /** `disable-model-invocation: true` in its frontmatter. */
  manualOnly: boolean;
  /** The user's `skillOverrides` entry for it; null when none. */
  override: string | null;
}

/** The text after the name: the description, then `when_to_use`, cut at `maxChars`. */
export function listingText(
  description: string,
  whenToUse: string,
  maxChars: number,
): { text: string; cut: boolean } {
  const parts = [description.trim(), whenToUse.trim()].filter(Boolean);
  const text = parts.join(" - ");
  return text.length > maxChars
    ? { text: text.slice(0, maxChars), cut: true }
    : { text, cut: false };
}

/** How the agent will list `input`, given the `skillOverrides` entry (which wins) and its own field. */
export function listingModeOf(input: ListingSkillInput): {
  mode: ListingMode;
  hiddenBy?: ListingHiddenBy;
} {
  // A plugin's skills are managed by the plugin manager; the overrides do not reach them.
  const override = input.origin === "folder" ? input.override : null;
  switch (override) {
    case "name-only":
      return { mode: "name_only" };
    case "user-invocable-only":
    case "off":
      return { mode: "hidden", hiddenBy: "override" };
    case "on":
      return { mode: "full" };
  }
  return input.manualOnly ? { mode: "hidden", hiddenBy: "frontmatter" } : { mode: "full" };
}

/** One skill's place in the listing. */
export function listingEntryOf(input: ListingSkillInput, maxChars: number): ListingEntry {
  const { mode, hiddenBy } = listingModeOf(input);
  const base = { name: input.name, path: input.path, origin: input.origin, mode };
  const identity = {
    ...base,
    ...(input.plugin === undefined ? {} : { plugin: input.plugin }),
    ...(hiddenBy === undefined ? {} : { hiddenBy }),
  };
  if (mode === "hidden") return { ...identity, chars: 0, cut: false };
  if (mode === "name_only") {
    return { ...identity, chars: input.name.length + LISTING_ENTRY_OVERHEAD, cut: false };
  }
  const { text, cut } = listingText(input.description, input.whenToUse, maxChars);
  return { ...identity, chars: input.name.length + LISTING_ENTRY_OVERHEAD + text.length, cut };
}

/** Characters the listing may take for a context window, at the documented 1%. */
export function defaultListingBudget(
  window: ListingWindow,
  fraction = LISTING_BUDGET_FRACTION,
): number {
  return Math.floor(LISTING_WINDOWS[window] * fraction * LISTING_CHARS_PER_TOKEN);
}

export interface ListingBudget {
  chars: number;
  source: ListingBudgetSource;
}

/**
 * The budget: a fixed character count the user set for Claude Code wins, then a fraction they
 * set, then the documented 1% of the window.
 */
export function listingBudgetOf(
  window: ListingWindow,
  setting: { characters?: number | null; fraction?: number | null },
): ListingBudget {
  if (setting.characters != null && setting.characters > 0) {
    return { chars: Math.floor(setting.characters), source: "characters" };
  }
  if (setting.fraction != null && setting.fraction > 0) {
    return { chars: defaultListingBudget(window, setting.fraction), source: "fraction" };
  }
  return { chars: defaultListingBudget(window), source: "default" };
}

const MODE_ORDER: Record<ListingMode, number> = { full: 0, name_only: 1, hidden: 2 };

/** The estimate for a set of skills: totals, and every skill with its cost, biggest first. */
export function summarizeListing(
  agent: { key: string; displayName: string },
  entries: readonly ListingEntry[],
  budget: ListingBudget,
  window: ListingWindow,
): SkillListingReport {
  const sorted = [...entries].sort(
    (a, b) =>
      MODE_ORDER[a.mode] - MODE_ORDER[b.mode] || b.chars - a.chars || a.name.localeCompare(b.name),
  );
  const used = sorted.reduce((sum, entry) => sum + entry.chars, 0);
  const count = (mode: ListingMode): number => sorted.filter((entry) => entry.mode === mode).length;
  return {
    agentKey: agent.key,
    agentName: agent.displayName,
    budget: budget.chars,
    budgetSource: budget.source,
    window,
    used,
    over: Math.max(0, used - budget.chars),
    full: count("full"),
    nameOnly: count("name_only"),
    hidden: count("hidden"),
    entries: sorted,
  };
}

/** The listed skills that use the most, biggest first. */
export function biggestListed(report: SkillListingReport, limit: number): ListingEntry[] {
  return report.entries.filter((entry) => entry.chars > 0).slice(0, limit);
}

export interface ListingReportOptions {
  /** The context window to assume for this call; the `skillListingWindow` setting when absent. */
  window?: ListingWindow;
}

export interface ListingApi {
  /**
   * What the agent's skill listing costs: skills in its folder and from its switched-on plugins.
   * Null for an agent that documents no listing budget, or one not found on this machine. Reads
   * files and changes nothing.
   */
  report(agentKey: string, options?: ListingReportOptions): Promise<SkillListingReport | null>;
}
