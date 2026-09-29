import { AGENT_FLAG, limitPositionals, positional, requireAgents } from "./support";
import type { CommandContext, CommandResult, CommandSpec } from "./types";

/** Block or allow a skill for the agents named with `--agent`. */
function blocker(blocked: boolean) {
  return async ({ core, args }: CommandContext): Promise<CommandResult> => {
    limitPositionals(args, 1);
    const skill = core.store.resolve(positional(args, 0, "a skill (id, name or folder name)"));
    // Blocking an agent that is not installed is fine: the block is waiting for it.
    const agents = requireAgents(core, args, false);
    const saved = await core.api.deploy.setBlocked(
      skill.id,
      agents.map((agent) => agent.key),
      blocked,
    );
    const names = agents.map((agent) => agent.key).join(", ");
    const text = blocked
      ? `${saved.name} is blocked for ${names}. It is not deployed there any more.`
      : `${saved.name} may be deployed to ${names} again.`;
    return { value: { id: saved.id, name: saved.name, blockedAgents: saved.blockedAgents }, text };
  };
}

export const blockCommand: CommandSpec = {
  name: "block",
  summary: "Never deploy a skill to these agents",
  usage: "<ref> --agent <key>…",
  flags: [AGENT_FLAG],
  notes: [
    "Removes the skill from an agent it is deployed to, then skips that agent whenever skills are deployed: by hand, in a preset or in a batch. Kept by Loadout and backed up with the tags. Projects are not affected.",
  ],
  run: blocker(true),
};

export const unblockCommand: CommandSpec = {
  name: "unblock",
  summary: "Allow a blocked skill on these agents again",
  usage: "<ref> --agent <key>…",
  flags: [AGENT_FLAG],
  notes: ["It is not deployed again by itself."],
  run: blocker(false),
};
