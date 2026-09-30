import { dirname } from "node:path";
import {
  LISTING_AGENT_KEY,
  LISTING_MAX_DESCRIPTION_CHARS,
  type ListingApi,
  type ListingSkillInput,
  type WorkspaceApi,
  listingBudgetOf,
  listingEntryOf,
  summarizeListing,
} from "@loadout/shared";
import type { AgentRegistry } from "../agents/registry";
import type { CoreContext } from "../context";
import { readListingSettings } from "./claude-settings";
import { readListingFields } from "./read-fields";

export interface ListingDeps {
  registry: AgentRegistry;
  workspace: Pick<WorkspaceApi, "list" | "plugins">;
}

export interface ListingService {
  api: ListingApi;
}

/**
 * The skill listing of Claude Code: every skill in its folder and every switched-on plugin skill,
 * as the agent will show them to the model. Everything is read, nothing is written.
 */
export function createListingService(ctx: CoreContext, deps: ListingDeps): ListingService {
  const api: ListingApi = {
    report: async (agentKey, options) => {
      if (agentKey !== LISTING_AGENT_KEY) return null;
      const agent = deps.registry.find(agentKey);
      if (!agent?.installed) return null;

      // The agent's own folder: the plugin manager sits inside it, so its parent holds settings.json.
      const configDir = agent.pluginsDir ? dirname(agent.pluginsDir) : dirname(agent.skillsDir);
      const settings = readListingSettings(configDir);
      const maxChars = settings.maxDescriptionChars ?? LISTING_MAX_DESCRIPTION_CHARS;

      const inputs: ListingSkillInput[] = [];
      for (const skill of await deps.workspace.list(agentKey)) {
        const fields = readListingFields(skill.path);
        inputs.push({
          name: skill.name,
          path: skill.path,
          origin: "folder",
          ...fields,
          override: settings.overrides[skill.name] ?? settings.overrides[skill.dirName] ?? null,
        });
      }
      for (const skill of await deps.workspace.plugins(agentKey)) {
        // A plugin that is switched off brings nothing to the listing.
        if (!skill.enabled) continue;
        inputs.push({
          name: skill.name,
          path: skill.path,
          origin: "plugin",
          plugin: skill.plugin,
          ...readListingFields(skill.path),
          override: null,
        });
      }

      const window = options?.window ?? ctx.settings.get("skillListingWindow");
      return summarizeListing(
        agent,
        inputs.map((input) => listingEntryOf(input, maxChars)),
        listingBudgetOf(window, settings),
        window,
      );
    },
  };
  return { api };
}
