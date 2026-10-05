import { isManualOnly, splitFrontmatter, textField } from "@loadout/shared";
import { readMarkerDocument } from "../skills/metadata";

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

const firstLine = (body: string): string =>
  body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) ?? "";

/** Never throws: a skill that cannot be read costs nothing. */
export function readListingFields(skillDir: string): ListingFields {
  const content = readMarkerDocument(skillDir);
  if (content === null) return NONE;
  const { data, body } = splitFrontmatter(content);
  return {
    description: textField(data, "description") ?? firstLine(body),
    whenToUse: textField(data, "when_to_use") ?? "",
    manualOnly: data ? isManualOnly(data) : false,
  };
}
