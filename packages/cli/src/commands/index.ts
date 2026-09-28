import { agentsGroup } from "./agents";
import { completionGroup } from "./completion";
import { doctorGroup } from "./doctor";
import { gitGroup } from "./git";
import { itemsGroup } from "./items";
import { presetsGroup } from "./presets";
import { projectGroup } from "./project";
import { removedGroup } from "./removed";
import { repoGroup } from "./repo";
import { skillsGroup } from "./skills";
import { sourcesGroup } from "./sources";
import type { CommandGroup } from "./types";

export const COMMAND_GROUPS: readonly CommandGroup[] = [
  repoGroup,
  agentsGroup,
  skillsGroup,
  itemsGroup,
  sourcesGroup,
  presetsGroup,
  projectGroup,
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
