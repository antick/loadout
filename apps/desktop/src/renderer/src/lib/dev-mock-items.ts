/** DEV ONLY. `items.*` for the browser preview: an empty library of subagents, commands, rules. */
import type { FoundItem, ItemImportResult, ItemPlace, LibraryItem } from "@loadout/shared";

type Handler = (...args: never[]) => unknown;

export function createItemsMockHandlers(): Record<string, Handler> {
  return {
    "items.list": (): LibraryItem[] => [],
    "items.places": (): ItemPlace[] => [],
    "items.find": (): FoundItem[] => [],
    "items.importItems": (): ItemImportResult => ({ imported: [], replaced: [], skipped: [] }),
  };
}
