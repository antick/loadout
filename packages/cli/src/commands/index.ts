import { agentsGroup } from "./agents";
import { completionGroup } from "./completion";
import { doctorGroup } from "./doctor";
import { gitGroup } from "./git";
import { presetsGroup } from "./presets";
import { removedGroup } from "./removed";
import { repoGroup } from "./repo";
import { skillsGroup } from "./skills";
import type { CommandGroup } from "./types";

export const COMMAND_GROUPS: readonly CommandGroup[] = [
  repoGroup,
  agentsGroup,
  skillsGroup,
  presetsGroup,
  removedGroup,
  gitGroup,
  doctorGroup,
  completionGroup,
];

export type {
  CommandContext,
  CommandGroup,
  CommandResult,
  CommandSpec,
  FreeCommandContext,
} from "./types";
