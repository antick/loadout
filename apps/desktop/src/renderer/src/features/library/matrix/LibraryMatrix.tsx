import type { AgentInfo, Skill } from "@loadout/shared";
import { type MouseEvent, type ReactNode, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AgentAvatar } from "@/components/AgentAvatar";
import { SkillIndicators } from "@/components/SkillIndicators";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useSetBlocked } from "@/features/library/library-mutations";
import { MatrixCell } from "@/features/library/matrix/MatrixCell";
import { agentColumnCoverage, matrixCellState } from "@/features/library/matrix/matrix-state";
import { useConfirmUndeploy, useDeploySkill, useUndeploySkill } from "@/hooks/mutations/deploy";
import { cn } from "@/lib/utils";
import { SECTION_LABEL } from "@/lib/styles";

export interface LibraryMatrixProps {
  skills: readonly Skill[];
  /** Agents that can take skills, one column each. */
  agents: readonly AgentInfo[];
  /** The skill whose panel is open. */
  currentId: string | null;
  selecting: boolean;
  isSelected: (skillId: string) => boolean;
  onSelectToggle: (skill: Skill, modifiers: { shiftKey: boolean }) => void;
  onOpen: (skill: Skill) => void;
}

interface CellTarget {
  skillId: string;
  agentKey: string;
}

const STICKY_HEAD = "sticky top-0 z-20 border-b bg-card";
// Opaque, so scrolled squares never show through; the tint matches the row's own.
const STICKY_SKILL =
  "sticky left-0 z-10 bg-card group-data-[current=true]/row:bg-[color-mix(in_srgb,var(--primary)_5%,var(--card))] group-data-[selected=true]/row:bg-[color-mix(in_srgb,var(--primary)_5%,var(--card))]";

/**
 * Every skill down the side, every agent across the top. One click on a square deploys or removes
 * that pair; a right-click blocks or allows it. The skills and their order are the library's.
 */
export function LibraryMatrix({
  skills,
  agents,
  currentId,
  selecting,
  isSelected,
  onSelectToggle,
  onOpen,
}: LibraryMatrixProps): ReactNode {
  const { t } = useTranslation();
  const deploy = useDeploySkill();
  const undeploy = useUndeploySkill();
  const confirmUndeploy = useConfirmUndeploy();
  const setBlocked = useSetBlocked();
  // Set by the right-click that opens the menu, so its one item knows which square it is for.
  const [target, setTarget] = useState<CellTarget | null>(null);
  const byId = useMemo(() => new Map(skills.map((skill) => [skill.id, skill])), [skills]);
  const targetSkill = target ? byId.get(target.skillId) : undefined;
  const targetState = targetSkill && target ? matrixCellState(targetSkill, target.agentKey) : null;
  const columns = useMemo(
    () => agents.map((agent) => ({ agent, coverage: agentColumnCoverage(skills, agent.key) })),
    [agents, skills],
  );

  if (agents.length === 0) {
    return (
      <p className="rounded-lg border border-dashed px-3 py-10 text-center text-sm text-muted-foreground">
        {t("library.matrix.noAgents")}
      </p>
    );
  }

  const cellLabel = (skill: Skill, agent: AgentInfo): string =>
    `${skill.name}: ${t(
      {
        deployed: "agentBadges.deployedTo",
        pending: "agentBadges.deployedTo",
        blocked: "agentBadges.blockedFor",
        empty: "agentBadges.notDeployedTo",
      }[matrixCellState(skill, agent.key)],
      { agent: agent.displayName },
    )}`;

  const toggle = (skill: Skill, agentKey: string): void => {
    const pair = { skillId: skill.id, agentKey };
    if (matrixCellState(skill, agentKey) !== "deployed") {
      deploy.mutate(pair);
      return;
    }
    const agentName = agents.find((agent) => agent.key === agentKey)?.displayName ?? agentKey;
    void confirmUndeploy(skill, agentKey, agentName).then((ok) => {
      if (ok) undeploy.mutate(pair);
    });
  };

  /** Only a square has a menu; anywhere else the right-click does nothing. */
  const pickTarget = (event: MouseEvent): void => {
    const cell = (event.target as HTMLElement).closest<HTMLElement>("[data-skill][data-agent]");
    const skillId = cell?.dataset.skill;
    const agentKey = cell?.dataset.agent;
    if (skillId && agentKey) setTarget({ skillId, agentKey });
    else event.preventDefault();
  };

  return (
    <ContextMenu onOpenChange={(open) => (open ? null : setTarget(null))}>
      <ContextMenuTrigger asChild>
        <div
          className="max-h-[calc(100vh-15rem)] min-h-40 overflow-auto rounded-lg border bg-card"
          onContextMenu={pickTarget}
        >
          <table className="w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th
                  scope="col"
                  className={cn(STICKY_HEAD, STICKY_SKILL, "z-30 px-3 py-2 text-left")}
                >
                  <span className={SECTION_LABEL}>{t("library.matrix.skill")}</span>
                </th>
                {columns.map(({ agent, coverage }) => (
                  <th
                    key={agent.key}
                    scope="col"
                    title={agent.displayName}
                    className={cn(STICKY_HEAD, "min-w-16 px-1 py-2 text-center font-normal")}
                  >
                    <AgentAvatar
                      agentKey={agent.key}
                      name={agent.displayName}
                      size="md"
                      className="mx-auto"
                    />
                    <span className="mt-1 block text-[0.625rem] text-muted-foreground tabular-nums">
                      {coverage.deployed}/{coverage.total}
                    </span>
                    <span className="sr-only">{agent.displayName}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {skills.map((skill) => (
                <tr
                  key={skill.id}
                  data-current={skill.id === currentId}
                  data-selected={isSelected(skill.id)}
                  className="group/row data-[current=true]:bg-primary/5 data-[selected=true]:bg-primary/5"
                >
                  <th
                    scope="row"
                    className={cn(
                      STICKY_SKILL,
                      "max-w-64 border-b px-3 py-1.5 text-left font-normal",
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      {selecting ? (
                        <Checkbox
                          checked={isSelected(skill.id)}
                          aria-label={t("selection.selectItem", { name: skill.name })}
                          onClick={(event) => onSelectToggle(skill, { shiftKey: event.shiftKey })}
                        />
                      ) : null}
                      <button
                        type="button"
                        title={skill.name}
                        onClick={(event) =>
                          selecting || event.shiftKey
                            ? onSelectToggle(skill, { shiftKey: event.shiftKey })
                            : onOpen(skill)
                        }
                        className="min-w-0 truncate rounded text-left font-medium hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none group-data-[current=true]/row:text-primary"
                      >
                        {skill.name}
                      </button>
                      <SkillIndicators skill={skill} compact />
                    </div>
                  </th>
                  {agents.map((agent) => (
                    <td key={agent.key} className="border-b p-1 text-center">
                      <MatrixCell
                        state={matrixCellState(skill, agent.key)}
                        label={cellLabel(skill, agent)}
                        skillId={skill.id}
                        agentKey={agent.key}
                        onToggle={() => toggle(skill, agent.key)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="min-w-56">
        {target && targetState ? (
          <ContextMenuItem
            disabled={targetState === "pending" || setBlocked.isPending}
            onSelect={() =>
              setBlocked.mutate({
                skillId: target.skillId,
                agentKeys: [target.agentKey],
                blocked: targetState !== "blocked",
              })
            }
          >
            {t(
              targetState === "blocked"
                ? "library.agents.allow"
                : targetState === "deployed"
                  ? "library.agents.blockAndRemove"
                  : "library.agents.block",
            )}
          </ContextMenuItem>
        ) : null}
      </ContextMenuContent>
    </ContextMenu>
  );
}
