import type { Project, ProjectTarget } from "@loadout/shared";
import { useMemo, useState } from "react";
import {
  type AgentTargetChip,
  chosenAgentKeys,
  projectTargetChips,
} from "@/components/AgentTargetChips";
import {
  useLastExportAgents,
  useProjectSkills,
  useProjectTargets,
} from "@/hooks/queries/project-detail";
import { useProjects } from "@/hooks/queries/projects";
import { LIBRARY_PLACE, defaultChipKeys, placeTargets, takenInFolders } from "./new-skill-place";

export interface NewSkillPlace {
  /** `LIBRARY_PLACE` or a project id. */
  placeId: string;
  setPlaceId(placeId: string): void;
  /** Projects a skill can be created in (their folder is still there). */
  projects: Project[];
  /** The chosen project; null for the library. */
  project: Project | null;
  /** Agent folders to tick; empty for the library and for a linked workspace. */
  chips: AgentTargetChip[];
  selected: ReadonlySet<string>;
  setSelected(selected: ReadonlySet<string>): void;
  /** What goes to the create call. */
  agentKeys: string[];
  /** The folders that get the skill, the one the editor opens first. */
  targets: ProjectTarget[];
  /** Folder names the chosen folders already hold, lower-cased. */
  taken: ReadonlySet<string>;
  /** The project's folders are known; always true for the library. */
  ready: boolean;
}

/** Where a new skill goes: the library, or straight into a project's agent folders. */
export function useNewSkillPlace(initialProjectId: string | null): NewSkillPlace {
  const allProjects = useProjects();
  const projects = useMemo(
    () => (allProjects.data ?? []).filter((entry) => !entry.missing),
    [allProjects.data],
  );
  const [placeId, setPlaceId] = useState(initialProjectId ?? LIBRARY_PLACE);
  const project = projects.find((entry) => entry.id === placeId) ?? null;
  const projectId = project?.id ?? null;
  const targetsQuery = useProjectTargets(projectId);
  const remembered = useLastExportAgents(projectId);
  const projectSkills = useProjectSkills(projectId);
  // A choice made in this dialog, for the project it was made for.
  const [picked, setPicked] = useState<{ placeId: string; keys: ReadonlySet<string> } | null>(null);

  const offered = useMemo(
    () => (project && targetsQuery.data ? placeTargets(project, targetsQuery.data) : []),
    [project, targetsQuery.data],
  );
  const linked = project?.type === "linked";
  const chips = useMemo(() => (linked ? [] : projectTargetChips(offered)), [linked, offered]);
  const selected = useMemo(
    () =>
      picked?.placeId === placeId
        ? picked.keys
        : defaultChipKeys(chips, offered, remembered.data ?? []),
    [picked, placeId, chips, offered, remembered.data],
  );
  const targets = useMemo(
    () => (linked ? offered : offered.filter((target) => selected.has(target.key))),
    [linked, offered, selected],
  );
  const taken = useMemo(
    () => takenInFolders(projectSkills.data ?? [], new Set(targets.map((target) => target.key))),
    [projectSkills.data, targets],
  );

  return {
    placeId: project ? placeId : LIBRARY_PLACE,
    setPlaceId,
    projects,
    project,
    chips,
    selected,
    setSelected: (keys) => setPicked({ placeId, keys }),
    agentKeys: linked ? [] : chosenAgentKeys(chips, selected),
    targets,
    taken,
    ready: !project || (targetsQuery.isSuccess && remembered.isSuccess),
  };
}
