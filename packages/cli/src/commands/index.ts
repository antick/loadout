import { agentsGroup } from "./agents";
import { gitGroup } from "./git";
import { presetsGroup } from "./presets";
import { repoGroup } from "./repo";
import { skillsGroup } from "./skills";
import type { CommandGroup } from "./types";

export const COMMAND_GROUPS: readonly CommandGroup[] = [
  repoGroup,
  agentsGroup,
  skillsGroup,
  presetsGroup,
  gitGroup,
];

export type { CommandContext, CommandGroup, CommandResult, CommandSpec } from "./types";
