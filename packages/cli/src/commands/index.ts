import { agentsGroup } from "./agents";
import { completionGroup } from "./completion";
import { doctorGroup } from "./doctor";
import { gitGroup } from "./git";
import { presetsGroup } from "./presets";
import { removedGroup } from "./removed";
import { repoGroup } from "./repo";
import { skillsGroup } from "./skills";
import { sourcesGroup } from "./sources";
import type { CommandGroup } from "./types";

export const COMMAND_GROUPS: readonly CommandGroup[] = [
  repoGroup,
  agentsGroup,
  skillsGroup,
  sourcesGroup,
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
