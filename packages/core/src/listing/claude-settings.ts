import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isRecord } from "@loadout/shared";

/**
 * What Claude Code's own `settings.json` says about its skill listing, read only. Values of the
 * wrong type are ignored, as the agent would ignore them: this file is not ours.
 */
export interface ListingSettings {
  /** `skillOverrides`: skill name to how it is listed. */
  overrides: Record<string, string>;
  /** `skillListingBudgetFraction`: share of the context window the listing may take. */
  fraction: number | null;
  /** `SLASH_COMMAND_TOOL_CHAR_BUDGET` from the `env` block: a fixed character count. */
  characters: number | null;
  /** `skillListingMaxDescChars`: cap on each entry's description. */
  maxDescriptionChars: number | null;
}

const SETTINGS_FILE = "settings.json";
const BUDGET_ENV = "SLASH_COMMAND_TOOL_CHAR_BUDGET";

function positive(value: unknown): number | null {
  const number = typeof value === "string" ? Number(value.trim()) : value;
  return typeof number === "number" && Number.isFinite(number) && number > 0 ? number : null;
}

export function readListingSettings(configDir: string): ListingSettings {
  let root: unknown = null;
  try {
    root = JSON.parse(readFileSync(join(configDir, SETTINGS_FILE), "utf8"));
  } catch {
    // Missing or unreadable: the agent's defaults apply.
  }
  const settings = isRecord(root) ? root : {};
  const overrides: Record<string, string> = {};
  if (isRecord(settings.skillOverrides)) {
    for (const [name, value] of Object.entries(settings.skillOverrides)) {
      if (typeof value === "string") overrides[name] = value;
    }
  }
  const env = isRecord(settings.env) ? settings.env : {};
  return {
    overrides,
    fraction: positive(settings.skillListingBudgetFraction),
    characters: positive(env[BUDGET_ENV]),
    maxDescriptionChars: positive(settings.skillListingMaxDescChars),
  };
}
