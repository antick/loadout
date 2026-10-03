/** DEV ONLY. `items.*` for the browser preview: an empty library of subagents, commands, rules. */
import type { FoundItem, ItemImportResult, ItemPlace, LibraryItem } from "@loadout/shared";
import type { MockHandlers } from "@/lib/dev-mock-types";

export function createItemsMockHandlers(): MockHandlers {
  return {
    "items.list": (): LibraryItem[] => [],
    "items.places": (): ItemPlace[] => [],
    "items.find": (): FoundItem[] => [],
    "items.importItems": (): ItemImportResult => ({ imported: [], replaced: [], skipped: [] }),
  };
}
