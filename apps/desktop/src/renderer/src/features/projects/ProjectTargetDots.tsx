import type { ProjectTarget } from "@loadout/shared";
import { type ReactNode, useMemo } from "react";
import { AgentBadgeRow } from "@/components/AgentBadgeRow";
import { isTargetAvailable, type ProjectSkillGroup } from "./project-skill-groups";
import { pendingTargetId } from "./use-project-skill-actions";

export interface ProjectTargetDotsProps {
  group: ProjectSkillGroup;
  targets: readonly ProjectTarget[];
  pendingTargets: ReadonlySet<string>;
  /** Omit for a read-only row, e.g. while selecting. */
  onToggle?: (group: ProjectSkillGroup, target: ProjectTarget) => void;
  className?: string;
}

/**
 * One dot per project target: lit when that agent folder holds a copy, ringed when one of
 * several copies is not in step with the library. Click a dim dot to add the skill there, a lit one to delete it.
 */
export function ProjectTargetDots({
  group,
  targets,
  pendingTargets,
  onToggle,
  className,
}: ProjectTargetDotsProps): ReactNode {
  const assigned = useMemo(
    () => new Set(group.variants.map((variant) => variant.agentKey)),
    [group.variants],
  );
  // With one copy the status badge already says it all; rings tell several copies apart.
  const warning = useMemo(
    () =>
      new Set(
        group.variants
          .filter((variant) => group.variants.length > 1 && variant.syncStatus !== "in_sync")
          .map((variant) => variant.agentKey),
      ),
    [group.variants],
  );
  // Unavailable agents only show up when they already hold a copy.
  const shown = targets.filter((target) => isTargetAvailable(target) || assigned.has(target.key));
  const pending = new Set(
    shown
      .filter((target) => pendingTargets.has(pendingTargetId(group.id, target.key)))
      .map((target) => target.key),
  );

  return (
    <AgentBadgeRow
      agents={shown}
      deployedKeys={assigned}
      warningKeys={warning}
      pendingKeys={pending}
      onToggle={onToggle ? (target) => onToggle(group, target) : undefined}
      className={className}
    />
  );
}
