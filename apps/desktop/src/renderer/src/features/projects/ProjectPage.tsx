import { APP_NAME, type Project } from "@loadout/shared";
import { Navigate, useNavigate } from "@tanstack/react-router";
import {
  FolderOpen,
  FolderSearch,
  ListChecks,
  MoreHorizontal,
  Pin,
  PinOff,
  Plus,
  RotateCw,
  SearchX,
  Unlink,
} from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useConfirm } from "@/components/ConfirmDialog";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { IconButton } from "@/components/IconButton";
import { PageHeader } from "@/components/layout/PageHeader";
import { SelectionToolbar } from "@/components/SelectionToolbar";
import { SKILL_ITEM_RAISED_CLASS } from "@/components/skill-item";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { LocalSkillCollection } from "@/features/local-skills/LocalSkillCollection";
import { LocalSkillSkeletons } from "@/features/local-skills/LocalSkillSkeletons";
import { LocalSkillToolbar } from "@/features/local-skills/LocalSkillToolbar";
import { SkillActionButtons } from "@/features/local-skills/SkillActionButtons";
import { SkillActionMenu } from "@/features/local-skills/SkillActionMenu";
import { useLocalSkillFilters } from "@/features/local-skills/use-local-skill-filters";
import { InstructionFilesSection } from "@/features/instructions/InstructionFilesSection";
import { useRefreshProject } from "@/hooks/mutations/project-detail";
import {
  useRecordProjectOpen,
  useRemoveProject,
  useRevealProject,
  useSetProjectPinned,
} from "@/hooks/mutations/projects";
import { useInstructionFiles } from "@/hooks/queries/instructions";
import { useProjectSkills, useProjectTargets } from "@/hooks/queries/project-detail";
import { useProjects } from "@/hooks/queries/projects";
import { useSelection } from "@/hooks/use-selection";
import { useViewMode } from "@/hooks/use-view-mode";
import {
  ENABLED_FILTERS,
  type EnabledFilter,
  groupKey,
  groupProjectSkills,
  matchesEnabledFilter,
  type ProjectSkillGroup,
} from "./project-skill-groups";
import { ProjectAddSkillsSheet } from "./ProjectAddSkillsSheet";
import { ProjectHeader } from "./ProjectHeader";
import { ProjectMissingBanner } from "./ProjectMissingBanner";
import { ProjectPresetBar } from "./ProjectPresetBar";
import { ProjectSelectionActions } from "./ProjectSelectionActions";
import { ProjectSkillDetail } from "./ProjectSkillDetail";
import { ProjectTargetDots } from "./ProjectTargetDots";
import { PushVersionDialog } from "./PushVersionDialog";
import { useProjectSkillActions } from "./use-project-skill-actions";

const VIEW_MODE_SCOPE = "project-workspace";
const NO_TARGETS = [] as const;

/** One project (or linked workspace): its skills grouped across agent folders. */
export interface ProjectPageProps {
  projectId: string;
  /** A skill to open once, by its relative path (from a link in the sidebar). */
  requestedSkill: string | null;
  onSkillOpened(): void;
}

export function ProjectPage({
  projectId,
  requestedSkill,
  onSkillOpened,
}: ProjectPageProps): ReactNode {
  const projects = useProjects();
  const project = projects.data?.find((entry) => entry.id === projectId);
  // A project linked a moment ago may not be in the cached list yet: wait for the refetch.
  if (projects.data && !project && !projects.isFetching) return <Navigate to="/projects" replace />;
  if (projects.error) {
    return <ErrorState error={projects.error} onRetry={() => void projects.refetch()} />;
  }
  // Until the list has loaded there is nothing to draw the page around.
  return project ? (
    <ProjectWorkspace
      project={project}
      requestedSkill={requestedSkill}
      onSkillOpened={onSkillOpened}
    />
  ) : null;
}

function ProjectWorkspace({
  project,
  requestedSkill,
  onSkillOpened,
}: Omit<ProjectPageProps, "projectId"> & { project: Project }): ReactNode {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const skills = useProjectSkills(project.missing ? null : project.id);
  const targets = useProjectTargets(project.id);
  const instructionFiles = useInstructionFiles(project.id, project.type === "project");
  const refresh = useRefreshProject();
  const removeProject = useRemoveProject();
  const revealProject = useRevealProject();
  const setPinned = useSetProjectPinned();
  const { mutate: recordOpen } = useRecordProjectOpen();
  // Once per visit: the page is mounted afresh for every project.
  useEffect(() => recordOpen(project.id), [recordOpen, project.id]);
  const [viewMode, setViewMode] = useViewMode(VIEW_MODE_SCOPE);
  const [enabledFilter, setEnabledFilter] = useState<EnabledFilter>("all");
  const [openId, setOpenId] = useState<string | null>(
    requestedSkill ? groupKey(requestedSkill) : null,
  );
  // A later link to another skill of the same project opens that one.
  const [seenRequest, setSeenRequest] = useState(requestedSkill);
  if (requestedSkill !== seenRequest) {
    setSeenRequest(requestedSkill);
    if (requestedSkill) setOpenId(groupKey(requestedSkill));
  }
  useEffect(() => {
    if (requestedSkill) onSkillOpened();
  }, [requestedSkill, onSkillOpened]);
  const [adding, setAdding] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const groups = useMemo(() => groupProjectSkills(skills.data ?? []), [skills.data]);
  const byEnabled = useCallback(
    (group: ProjectSkillGroup) => matchesEnabledFilter(group, enabledFilter),
    [enabledFilter],
  );
  const filters = useLocalSkillFilters(groups, byEnabled, enabledFilter !== "all");
  const orderedIds = useMemo(() => filters.filtered.map((group) => group.id), [filters.filtered]);
  const selection = useSelection(orderedIds);

  const closeIfOpen = useCallback(
    (group: ProjectSkillGroup) => setOpenId((current) => (current === group.id ? null : current)),
    [],
  );
  const actions = useProjectSkillActions(project, closeIfOpen);
  const openGroup = useMemo(
    () => groups.find((group) => group.id === openId) ?? null,
    [groups, openId],
  );
  const selectedGroups = useMemo(() => {
    const ids = new Set(selection.selectedIds);
    return groups.filter((group) => ids.has(group.id));
  }, [groups, selection.selectedIds]);

  const allTargets = targets.data ?? NO_TARGETS;
  // A missing folder is never read, so there is nothing to count (and nothing to wait for).
  const headerCounts = project.missing
    ? null
    : skills.data && {
        enabled: groups.filter((group) => group.enabledState !== "none").length,
        total: groups.length,
      };

  const onRefresh = async (): Promise<void> => {
    setRefreshing(true);
    await refresh(project.id);
    setRefreshing(false);
  };

  const onRemoveProject = async (): Promise<void> => {
    const ok = await confirm({
      title: t("projects.removeTitle", { name: project.name, app: APP_NAME }),
      description: t("projects.removeDescription"),
      confirmLabel: t("projects.remove"),
    });
    if (!ok) return;
    removeProject.mutate(project, { onSuccess: () => void navigate({ to: "/projects" }) });
  };

  return (
    <div className="flex min-h-full flex-col gap-4 px-6 py-5">
      <PageHeader
        title={project.name}
        subtitle={skills.data ? t("projectPage.skillCount", { count: groups.length }) : undefined}
        actions={
          <>
            <IconButton
              label={t("projectPage.refresh")}
              icon={
                <RotateCw
                  className={refreshing ? "animate-spin motion-reduce:animate-none" : undefined}
                />
              }
              disabled={refreshing || project.missing}
              onClick={() => void onRefresh()}
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <IconButton label={t("projectPage.more")} icon={<MoreHorizontal />} />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onSelect={() =>
                    setPinned.mutate({ projectId: project.id, pinned: !project.pinned })
                  }
                >
                  {project.pinned ? <PinOff /> : <Pin />}
                  {t(project.pinned ? "projects.unpin" : "projects.pin")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={project.missing}
                  onSelect={() => revealProject.mutate(project.id)}
                >
                  <FolderOpen />
                  {t("common.reveal")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => void onRemoveProject()}>
                  <Unlink />
                  {t("projects.remove")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              size="sm"
              variant={selection.active ? "secondary" : "outline"}
              disabled={groups.length === 0}
              onClick={selection.active ? selection.exit : selection.enter}
            >
              <ListChecks />
              {t("projectPage.select")}
            </Button>
            <Button
              size="sm"
              disabled={project.missing || !targets.data}
              onClick={() => setAdding(true)}
            >
              <Plus />
              {t("projectPage.addSkills")}
            </Button>
          </>
        }
      />

      <ProjectHeader project={project} counts={headerCounts} />

      {project.missing ? (
        <ProjectMissingBanner project={project} onRemove={() => void onRemoveProject()} />
      ) : (
        <>
          <InstructionFilesSection files={instructionFiles.data} showReaders />

          <ProjectPresetBar project={project} targets={targets.data} groups={groups} />

          <LocalSkillToolbar
            filters={filters}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            searchPlaceholder={t("projectPage.search")}
            summary={
              filters.isFiltering
                ? t("localSkills.shownOf", { shown: filters.filtered.length, total: groups.length })
                : undefined
            }
          >
            <ToggleGroup
              type="single"
              size="sm"
              variant="outline"
              value={enabledFilter}
              aria-label={t("projectPage.filter.label")}
              onValueChange={(next) => {
                const picked = ENABLED_FILTERS.find((entry) => entry === next);
                if (picked) setEnabledFilter(picked);
              }}
            >
              {ENABLED_FILTERS.map((entry) => (
                <ToggleGroupItem key={entry} value={entry} className="px-2.5 text-xs">
                  {t(`projectPage.filter.${entry}`)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </LocalSkillToolbar>

          <SelectionToolbar selection={selection}>
            <ProjectSelectionActions
              project={project}
              selected={selectedGroups}
              onDone={selection.exit}
            />
          </SelectionToolbar>

          {skills.isPending ? (
            <LocalSkillSkeletons viewMode={viewMode} />
          ) : skills.error ? (
            <ErrorState
              error={skills.error}
              onRetry={() => void skills.refetch()}
              className="flex-1"
            />
          ) : groups.length === 0 ? (
            <EmptyState
              icon={FolderSearch}
              title={t("projectPage.emptyTitle")}
              description={t("projectPage.emptyDescription")}
              action={{
                label: t("projectPage.addSkills"),
                icon: Plus,
                onClick: () => setAdding(true),
              }}
              className="flex-1"
            />
          ) : filters.filtered.length === 0 ? (
            <EmptyState
              icon={SearchX}
              title={t("localSkills.noMatchTitle")}
              description={t("localSkills.noMatchDescription")}
              action={{
                label: t("localSkills.clearFilters"),
                onClick: () => {
                  filters.reset();
                  setEnabledFilter("all");
                },
              }}
              className="flex-1"
            />
          ) : (
            <LocalSkillCollection
              items={filters.filtered}
              viewMode={viewMode}
              selection={selection}
              currentId={openId}
              onOpen={(group) => setOpenId(group.id)}
              menuActions={(group) => actions.actionsFor(group)}
              renderActions={(group) => (
                <>
                  {project.supportsToggle ? (
                    <Switch
                      checked={group.enabledState === "all"}
                      aria-label={t("projectPage.toggleSkill", { name: group.name })}
                      onCheckedChange={() => actions.toggleEnabled(group)}
                    />
                  ) : null}
                  <SkillActionMenu name={group.name} actions={actions.actionsFor(group)} />
                </>
              )}
              renderFooter={(group) => (
                <>
                  <ProjectTargetDots
                    group={group}
                    targets={allTargets}
                    pendingTargets={actions.pendingTargets}
                    onToggle={selection.active ? undefined : actions.toggleTarget}
                    className={SKILL_ITEM_RAISED_CLASS}
                  />
                  {selection.active ? null : (
                    <span className="ml-auto flex items-center gap-1.5">
                      <SkillActionButtons actions={actions.actionsFor(group)} />
                    </span>
                  )}
                </>
              )}
            />
          )}
        </>
      )}

      <ProjectSkillDetail
        project={project}
        group={openGroup}
        targets={allTargets}
        actions={actions}
        onClose={() => setOpenId(null)}
      />

      <PushVersionDialog choice={actions.versionChoice} onClose={actions.closeVersionChoice} />

      <ProjectAddSkillsSheet
        open={adding}
        onOpenChange={setAdding}
        project={project}
        targets={allTargets}
        groups={groups}
      />
    </div>
  );
}
