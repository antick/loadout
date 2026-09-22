import type { Project, ProjectTarget } from "@loadout/shared";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { AgentAvatar } from "@/components/AgentAvatar";
import { SyncStatusBadge } from "@/components/SyncStatusBadge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { LocalSkillDetailSheet } from "@/features/local-skills/LocalSkillDetailSheet";
import { SkillActionButtons } from "@/features/local-skills/SkillActionButtons";
import { useProjectDocument } from "@/hooks/queries/project-detail";
import { useLastDefined } from "@/hooks/use-last-defined";
import { cn } from "@/lib/utils";
import {
  isTargetAvailable,
  leadVariant,
  type ProjectSkillGroup,
  variantFor,
} from "./project-skill-groups";
import { pendingTargetId, type ProjectSkillActions } from "./use-project-skill-actions";

export interface ProjectSkillDetailProps {
  project: Project;
  /** The skill to show; null closes the sheet. */
  group: ProjectSkillGroup | null;
  targets: readonly ProjectTarget[];
  actions: ProjectSkillActions;
  onClose: () => void;
}

const ENABLED_SWITCH_ID = "project-skill-enabled";
const SECTION_LABEL_CLASS = "text-xs font-medium tracking-wider text-muted-foreground uppercase";

/** Detail sheet of one project skill: switch, per-agent copies, files and the document tabs. */
export function ProjectSkillDetail({
  project,
  group: openGroup,
  targets,
  actions,
  onClose,
}: ProjectSkillDetailProps): ReactNode {
  const { t } = useTranslation();
  // The sheet keeps its content while it slides out, so keep the last skill around as well.
  const group = useLastDefined(openGroup);
  // Which copy's document is on screen; falls back to the one that needs attention most.
  const [viewKey, setViewKey] = useState<string | null>(null);
  const shown = group ? (variantFor(group, viewKey ?? "") ?? leadVariant(group)) : undefined;
  const document = useProjectDocument(project.id, shown?.relativePath, shown?.agentKey);

  const listed = group
    ? targets.filter((target) => isTargetAvailable(target) || variantFor(group, target.key))
    : [];

  return (
    <LocalSkillDetailSheet
      item={openGroup}
      onClose={() => {
        setViewKey(null);
        onClose();
      }}
      path={shown?.path}
      document={document}
      localLabel={t("projectPage.detail.projectTab")}
      editLocation={
        shown
          ? {
              kind: "project",
              projectId: project.id,
              relativePath: shown.relativePath,
              agentKey: shown.agentKey,
            }
          : undefined
      }
      actions={
        group ? <SkillActionButtons all size="sm" actions={actions.actionsFor(group)} /> : null
      }
    >
      {group && project.supportsToggle ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
          <div className="min-w-0">
            <Label htmlFor={ENABLED_SWITCH_ID}>{t("projectPage.detail.enabled")}</Label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t("projectPage.detail.enabledHint")}
            </p>
          </div>
          <Switch
            id={ENABLED_SWITCH_ID}
            checked={group.enabledState === "all"}
            onCheckedChange={() => actions.toggleEnabled(group)}
          />
        </div>
      ) : null}

      {group ? (
        <section className="flex flex-col gap-2">
          <h3 className={SECTION_LABEL_CLASS}>{t("projectPage.detail.agents")}</h3>
          <ul className="flex flex-col divide-y rounded-lg border">
            {listed.map((target) => {
              const variant = variantFor(group, target.key);
              const pending = actions.pendingTargets.has(pendingTargetId(group.id, target.key));
              const viewing = variant !== undefined && variant === shown;
              return (
                <li key={target.key} className="flex items-center gap-3 px-3 py-2">
                  <AgentAvatar
                    agentKey={target.key}
                    name={target.displayName}
                    size="sm"
                    status={variant ? undefined : "off"}
                  />
                  <div className="min-w-0 flex-1">
                    <p className={cn("truncate text-sm", !variant && "text-muted-foreground")}>
                      {target.displayName}
                    </p>
                    {target.relativeDir ? (
                      <p className="truncate font-mono text-xs text-muted-foreground">
                        {target.relativeDir}
                      </p>
                    ) : null}
                  </div>
                  {variant ? <SyncStatusBadge status={variant.syncStatus} /> : null}
                  {variant && group.variants.length > 1 ? (
                    <Button
                      size="xs"
                      variant={viewing ? "secondary" : "ghost"}
                      aria-pressed={viewing}
                      onClick={() => setViewKey(target.key)}
                    >
                      {t(viewing ? "projectPage.detail.viewing" : "projectPage.detail.view")}
                    </Button>
                  ) : null}
                  {pending ? <Spinner className="size-4" /> : null}
                  <Switch
                    checked={variant !== undefined}
                    disabled={pending}
                    aria-label={t(
                      variant ? "projectPage.targets.removeFrom" : "projectPage.targets.addTo",
                      { target: target.displayName },
                    )}
                    onCheckedChange={() => actions.toggleTarget(group, target)}
                  />
                </li>
              );
            })}
          </ul>
          {group.librarySkillId ? null : (
            <p className="text-xs text-muted-foreground">{t("projectPage.targets.needsLibrary")}</p>
          )}
        </section>
      ) : null}
    </LocalSkillDetailSheet>
  );
}
