/**
 * DEV ONLY. `listing.*` for the browser preview: Claude Code's skill listing, costed from the
 * preview's own agent folder and plugin skills with the same rules as the real one.
 */
import {
  LISTING_AGENT_KEY,
  LISTING_MAX_DESCRIPTION_CHARS,
  type ListingReportOptions,
  type ListingSkillInput,
  type Settings,
  listingBudgetOf,
  listingEntryOf,
  summarizeListing,
} from "@loadout/shared";
import { type MockHandlers, callMock } from "@/lib/dev-mock-types";

export function createListingMockHandlers(
  getSettings: () => Settings,
  handlers: MockHandlers,
): MockHandlers {
  return {
    "listing.report": async (agentKey: string, options?: ListingReportOptions) => {
      if (agentKey !== LISTING_AGENT_KEY) return null;
      const window = options?.window ?? getSettings().skillListingWindow;
      const folder = await callMock(handlers, "workspace.list", agentKey);
      const plugins = await callMock(handlers, "workspace.plugins", agentKey);
      const base = { whenToUse: "", manualOnly: false, override: null };
      const inputs: ListingSkillInput[] = [
        ...folder.map((skill) => ({
          ...base,
          name: skill.name,
          path: skill.path,
          origin: "folder" as const,
          description: skill.description ?? "",
        })),
        ...plugins
          .filter((skill) => skill.enabled)
          .map((skill) => ({
            ...base,
            name: skill.name,
            path: skill.path,
            origin: "plugin" as const,
            plugin: skill.plugin,
            description: skill.description ?? "",
          })),
      ];
      return summarizeListing(
        { key: agentKey, displayName: "Claude Code" },
        inputs.map((input) => listingEntryOf(input, LISTING_MAX_DESCRIPTION_CHARS)),
        listingBudgetOf(window, {}),
        window,
      );
    },
  };
}
