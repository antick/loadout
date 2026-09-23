import type { Skill } from "@loadout/shared";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { ErrorState } from "@/components/ErrorState";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AgentsTab } from "@/features/library/detail/AgentsTab";
import { CompareTab } from "@/features/library/detail/CompareTab";
import { DocumentTab } from "@/features/library/detail/DocumentTab";
import { PresetsTab } from "@/features/library/detail/PresetsTab";
import { ProjectsTab } from "@/features/library/detail/ProjectsTab";
import { RemovalGuardDialog } from "@/features/library/detail/RemovalGuardDialog";
import { SkillDetailHeader } from "@/features/library/detail/SkillDetailHeader";
import { SourceTab } from "@/features/library/detail/SourceTab";
import { useSkillRefresh } from "@/features/library/detail/use-skill-refresh";
import { useDeleteSkills } from "@/features/library/use-delete-skills";
import { useAvailableAgents } from "@/hooks/queries/agents";
import { useSkill } from "@/hooks/queries/skills";

const DETAIL_TABS = ["document", "source", "compare", "agents", "presets", "projects"] as const;
type DetailTab = (typeof DETAIL_TABS)[number];
const DEFAULT_TAB: DetailTab = "document";
const TAB_PANEL_CLASS = "min-h-0 flex-1 overflow-y-auto px-6 py-5";

/** Mounted once per opened skill, so tab choice and update state never leak between skills. */
function SkillDetailBody({ skill, onClose }: { skill: Skill; onClose: () => void }): ReactNode {
  const { t } = useTranslation();
  const [tab, setTab] = useState<DetailTab>(DEFAULT_TAB);
  const refresh = useSkillRefresh(skill);
  const deleteSkills = useDeleteSkills();
  const availableAgents = useAvailableAgents();

  const deployedToAvailable = (availableAgents.data ?? []).filter((agent) =>
    skill.deployments.some((entry) => entry.agentKey === agent.key),
  ).length;
  const counts: Partial<Record<DetailTab, string>> = {
    agents: availableAgents.data
      ? `${deployedToAvailable}/${availableAgents.data.length}`
      : undefined,
    presets: skill.presetIds.length > 0 ? String(skill.presetIds.length) : undefined,
  };

  return (
    <>
      <SkillDetailHeader
        skill={skill}
        onDelete={() => void deleteSkills([skill]).then((started) => (started ? onClose() : null))}
      />
      <Tabs
        value={tab}
        onValueChange={(next) => setTab(next as DetailTab)}
        className="min-h-0 flex-1 gap-0"
      >
        <div className="border-b px-6 py-2">
          <TabsList>
            {DETAIL_TABS.map((name) => (
              <TabsTrigger key={name} value={name}>
                {t(`library.detail.tabs.${name}`)}
                {counts[name] ? (
                  <span className="font-mono text-[0.6875rem] text-muted-foreground tabular-nums">
                    {counts[name]}
                  </span>
                ) : null}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <TabsContent value="document" className={TAB_PANEL_CLASS}>
          <DocumentTab skill={skill} />
        </TabsContent>
        <TabsContent value="source" className={TAB_PANEL_CLASS}>
          <SourceTab skill={skill} refresh={refresh} />
        </TabsContent>
        <TabsContent value="compare" className={TAB_PANEL_CLASS}>
          <CompareTab skill={skill} />
        </TabsContent>
        <TabsContent value="agents" className={TAB_PANEL_CLASS}>
          <AgentsTab skill={skill} />
        </TabsContent>
        <TabsContent value="presets" className={TAB_PANEL_CLASS}>
          <PresetsTab skill={skill} />
        </TabsContent>
        <TabsContent value="projects" className={TAB_PANEL_CLASS}>
          <ProjectsTab skill={skill} />
        </TabsContent>
      </Tabs>

      <RemovalGuardDialog
        skillName={skill.name}
        removals={refresh.pending?.removals ?? null}
        busy={refresh.running}
        onApprove={refresh.approve}
        onDecline={refresh.decline}
      />
    </>
  );
}

export interface SkillDetailSheetProps {
  /** Null keeps the panel closed. */
  skillId: string | null;
  onClose: () => void;
}

/** Wide panel on the right with everything about one library skill. */
export function SkillDetailSheet({ skillId, onClose }: SkillDetailSheetProps): ReactNode {
  const { t } = useTranslation();
  // Keep the last skill on screen while the panel slides out.
  const [shownId, setShownId] = useState(skillId);
  if (skillId !== null && skillId !== shownId) setShownId(skillId);
  const skill = useSkill(shownId);

  return (
    <Sheet open={skillId !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <SheetContent
        className="flex w-full flex-col gap-0 sm:max-w-3xl"
        // Focus the panel, not its first button, so no tooltip pops up on opening.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          if (event.currentTarget instanceof HTMLElement) event.currentTarget.focus();
        }}
      >
        {skill.data ? (
          <SkillDetailBody key={skill.data.id} skill={skill.data} onClose={onClose} />
        ) : (
          <>
            <SheetHeader className="border-b px-6 pt-5 pb-4">
              <SheetTitle>{t("library.detail.title")}</SheetTitle>
              <SheetDescription>
                {skill.isError ? t("library.detail.missing") : t("library.detail.loading")}
              </SheetDescription>
            </SheetHeader>
            <div className="flex-1 px-6 py-5">
              {skill.isError ? (
                <ErrorState error={skill.error} onRetry={() => void skill.refetch()} />
              ) : (
                <div className="flex flex-col gap-3">
                  <Skeleton className="h-6 w-1/2" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-40 w-full" />
                </div>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
