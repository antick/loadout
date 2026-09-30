/**
 * DEV ONLY. `listing.*` for the browser preview: Claude Code's skill listing, costed from the
 * preview's own agent folder and plugin skills with the same rules as the real one.
 */
import {
  LISTING_AGENT_KEY,
  LISTING_MAX_DESCRIPTION_CHARS,
  type ListingReportOptions,
  type ListingSkillInput,
  type LocalSkill,
  type PluginSkill,
  type Settings,
  listingBudgetOf,
  listingEntryOf,
  summarizeListing,
} from "@loadout/shared";

type Handler = (...args: never[]) => unknown;
type Handlers = Record<string, Handler>;

/** Calls another mock handler, as the real service calls the other services. */
function call<T>(handlers: Handlers, channel: string, ...args: unknown[]): Promise<T> {
  const handler = handlers[channel] as ((...values: unknown[]) => T | Promise<T>) | undefined;
  if (!handler) throw new Error(`No mock for ${channel}`);
  return Promise.resolve(handler(...args));
}

export function createListingMockHandlers(
  getSettings: () => Settings,
  handlers: Handlers,
): Handlers {
  return {
    "listing.report": async (agentKey: string, options?: ListingReportOptions) => {
      if (agentKey !== LISTING_AGENT_KEY) return null;
      const window = options?.window ?? getSettings().skillListingWindow;
      const folder = await call<LocalSkill[]>(handlers, "workspace.list", agentKey);
      const plugins = await call<PluginSkill[]>(handlers, "workspace.plugins", agentKey);
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
