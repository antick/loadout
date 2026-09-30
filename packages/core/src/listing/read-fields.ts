import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SKILL_MARKER_FILES, isManualOnly } from "@loadout/shared";
import { splitFrontmatter } from "../skills/metadata";

/** What an agent reads from a skill's document to decide how to list it. */
export interface ListingFields {
  /** `description`; the first line of the document when there is none, as the agent does. */
  description: string;
  /** `when_to_use`. */
  whenToUse: string;
  /** `disable-model-invocation: true`. */
  manualOnly: boolean;
}

const NONE: ListingFields = { description: "", whenToUse: "", manualOnly: false };

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

const firstLine = (body: string): string =>
  body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) ?? "";

/** Never throws: a skill that cannot be read costs nothing. */
export function readListingFields(skillDir: string): ListingFields {
  for (const marker of SKILL_MARKER_FILES) {
    let content: string;
    try {
      content = readFileSync(join(skillDir, marker), "utf8");
    } catch {
      continue;
    }
    const { data, body } = splitFrontmatter(content);
    return {
      description: text(data?.description) || firstLine(body),
      whenToUse: text(data?.when_to_use),
      manualOnly: data ? isManualOnly(data) : false,
    };
  }
  return NONE;
}
