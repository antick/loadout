import type { LocalSkill } from "@loadout/shared";
import { Navigate } from "@tanstack/react-router";
import { FolderSearch, ListChecks, Plus, RotateCw, SearchX } from "lucide-react";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AddFromLibrarySheet } from "@/components/AddFromLibrarySheet";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { IconButton } from "@/components/IconButton";
import { PageHeader } from "@/components/layout/PageHeader";
import { SelectionToolbar } from "@/components/SelectionToolbar";
import { Button } from "@/components/ui/button";
import { type LocalSkillView, toLocalSkillView } from "@/features/local-skills/local-skill-view";
import { LinkBadge } from "@/features/local-skills/LinkBadge";
import { LocalSkillCollection } from "@/features/local-skills/LocalSkillCollection";
import { LocalSkillDetailSheet } from "@/features/local-skills/LocalSkillDetailSheet";
import { LocalSkillSkeletons } from "@/features/local-skills/LocalSkillSkeletons";
import { LocalSkillToolbar } from "@/features/local-skills/LocalSkillToolbar";
import { SkillActionButtons } from "@/features/local-skills/SkillActionButtons";
import { SkillActionMenu } from "@/features/local-skills/SkillActionMenu";
import { useLocalSkillFilters } from "@/features/local-skills/use-local-skill-filters";
import { InstructionFilesSection } from "@/features/instructions/InstructionFilesSection";
import { useDeployToAgent, useRefreshWorkspace } from "@/hooks/mutations/workspace";
import { isAgentAvailable, useAgents } from "@/hooks/queries/agents";
import { useInstructionFiles } from "@/hooks/queries/instructions";
import { useSkills } from "@/hooks/queries/skills";
import {
  useBrokenFolders,
  useWorkspaceDocument,
  useWorkspaceSkills,
} from "@/hooks/queries/workspace";
import { useLastDefined } from "@/hooks/use-last-defined";
import { useSelection } from "@/hooks/use-selection";
import { useViewMode } from "@/hooks/use-view-mode";
import { summarizeAgentFolder } from "./agent-skill-rules";
import { AgentPresetBar } from "./AgentPresetBar";
import { AgentSelectionActions } from "./AgentSelectionActions";
import { AgentWorkspaceHeader } from "./AgentWorkspaceHeader";
import { BrokenFoldersNotice } from "./BrokenFoldersNotice";
import { useAgentSkillActions } from "./use-agent-skill-actions";

const VIEW_MODE_SCOPE = "agent-workspace";

/** Everything inside one agent's global skills folder, managed or not. */
export function AgentWorkspacePage({ agentKey }: { agentKey: string }): ReactNode {
  const { t } = useTranslation();
  const agents = useAgents();
  const library = useSkills();
  const workspace = useWorkspaceSkills(agentKey);
  const broken = useBrokenFolders(agentKey);
  const refresh = useRefreshWorkspace();
  const deployToAgent = useDeployToAgent();
  const [viewMode, setViewMode] = useViewMode(VIEW_MODE_SCOPE);
  const [openPath, setOpenPath] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const instructionFiles = useInstructionFiles(null);
  const agentInstructions = useMemo(
    () =>
      instructionFiles.data?.filter((file) =>
        file.readers.some((reader) => reader.agentKey === agentKey),
      ),
    [instructionFiles.data, agentKey],
  );

  const agent = agents.data?.find((entry) => entry.key === agentKey);
  const agentName = agent?.displayName ?? agentKey;

  // Default order is the backend's; the views keep it.
  const skillsByPath = useMemo(
    () => new Map((workspace.data ?? []).map((skill) => [skill.relativePath, skill])),
    [workspace.data],
  );
  const views = useMemo(() => (workspace.data ?? []).map(toLocalSkillView), [workspace.data]);
  const filters = useLocalSkillFilters(views);
  const orderedIds = useMemo(() => filters.filtered.map((view) => view.id), [filters.filtered]);
  const selection = useSelection(orderedIds);

  const closeIfOpen = useCallback(
    (skill: LocalSkill) =>
      setOpenPath((current) => (current === skill.relativePath ? null : current)),
    [],
  );
  const actionsFor = useAgentSkillActions(agentName, closeIfOpen);

  // The sheet keeps its content while it slides out, so its skill outlives `openPath` briefly.
  const openSkill = useLastDefined(openPath ? (skillsByPath.get(openPath) ?? null) : null);
  const openView = useMemo(
    () => views.find((view) => view.id === openPath) ?? null,
    [views, openPath],
  );
  const openDocument = useWorkspaceDocument(agentKey, openSkill?.relativePath);

  if (agents.data && !agents.isFetching && (!agent || !isAgentAvailable(agent))) {
    return <Navigate to="/agents" replace />;
  }

  const skillOf = (view: LocalSkillView): LocalSkill | undefined => skillsByPath.get(view.id);
  const managedBadge = (view: LocalSkillView): ReactNode => {
    const skill = skillOf(view);
    return skill ? <LinkBadge skill={skill} /> : null;
  };
  const selectedSkills = selection.selectedIds.flatMap((id) => skillsByPath.get(id) ?? []);
  const names = new Map((agents.data ?? []).map((entry) => [entry.key, entry.displayName]));

  const onRefresh = async (): Promise<void> => {
    setRefreshing(true);
    await refresh(agentKey);
    setRefreshing(false);
  };

  return (
    <div className="flex min-h-full flex-col gap-4 px-6 py-5">
      <PageHeader
        title={agentName}
        breadcrumbs={[{ label: t("nav.agents"), to: "/agents" }]}
        subtitle={
          workspace.data ? t("agents.skillCount", { count: workspace.data.length }) : undefined
        }
        actions={
          <>
            <IconButton
              label={t("agents.workspace.refresh")}
              icon={
                <RotateCw
                  className={refreshing ? "animate-spin motion-reduce:animate-none" : undefined}
                />
              }
              disabled={refreshing}
              onClick={() => void onRefresh()}
            />
            <Button
              size="sm"
              variant={selection.active ? "secondary" : "outline"}
              disabled={views.length === 0}
              onClick={selection.active ? selection.exit : selection.enter}
            >
              <ListChecks />
              {t("agents.workspace.select")}
            </Button>
            <Button size="sm" onClick={() => setAdding(true)}>
              <Plus />
              {t("agents.workspace.addSkills")}
            </Button>
          </>
        }
      />

      {agent ? (
        <AgentWorkspaceHeader
          agent={agent}
          summary={workspace.data ? summarizeAgentFolder(workspace.data) : undefined}
          sharedWith={agent.sharesDirWith.map((key) => names.get(key) ?? key)}
        />
      ) : null}

      <InstructionFilesSection files={agentInstructions} showReaders={false} />

      <AgentPresetBar agentKeys={[agentKey]} />

      <BrokenFoldersNotice agentKey={agentKey} agentName={agentName} folders={broken.data} />

      <LocalSkillToolbar
        filters={filters}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        searchPlaceholder={t("agents.workspace.search")}
        summary={
          filters.isFiltering
            ? t("localSkills.shownOf", { shown: filters.filtered.length, total: views.length })
            : undefined
        }
      />

      <SelectionToolbar selection={selection}>
        <AgentSelectionActions
          agentKey={agentKey}
          agentName={agentName}
          selected={selectedSkills}
          onDone={selection.exit}
        />
      </SelectionToolbar>

      {workspace.isPending ? (
        <LocalSkillSkeletons viewMode={viewMode} />
      ) : workspace.error ? (
        <ErrorState
          error={workspace.error}
          onRetry={() => void workspace.refetch()}
          className="flex-1"
        />
      ) : views.length === 0 ? (
        <EmptyState
          icon={FolderSearch}
          title={t("agents.workspace.emptyTitle")}
          description={t("agents.workspace.emptyDescription", { agent: agentName })}
          action={{
            label: t("agents.workspace.addSkills"),
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
          action={{ label: t("localSkills.clearFilters"), onClick: filters.reset }}
          className="flex-1"
        />
      ) : (
        <LocalSkillCollection
          items={filters.filtered}
          viewMode={viewMode}
          selection={selection}
          currentId={openPath}
          onOpen={(view) => setOpenPath(view.id)}
          renderBadges={managedBadge}
          menuActions={(view) => {
            const skill = skillOf(view);
            return skill ? actionsFor(skill) : [];
          }}
          renderActions={(view) => {
            const skill = skillOf(view);
            return skill ? <SkillActionMenu name={view.name} actions={actionsFor(skill)} /> : null;
          }}
          renderFooter={(view) => {
            const skill = skillOf(view);
            if (!skill || selection.active) return null;
            const actions = actionsFor(skill).filter((action) => action.primary);
            return actions.length > 0 ? <SkillActionButtons actions={actions} /> : null;
          }}
        />
      )}

      <LocalSkillDetailSheet
        item={openView}
        onClose={() => setOpenPath(null)}
        path={openSkill?.path}
        document={openDocument}
        badges={openView ? managedBadge(openView) : null}
        editLocation={
          openSkill ? { kind: "agent", agentKey, relativePath: openSkill.relativePath } : undefined
        }
        actions={
          openSkill ? <SkillActionButtons all size="sm" actions={actionsFor(openSkill)} /> : null
        }
      />

      <AddFromLibrarySheet
        open={adding}
        onOpenChange={setAdding}
        target={{ kind: "agent", agentKey }}
        title={t("agents.workspace.addTitle", { agent: agentName })}
        description={t("agents.workspace.addDescription")}
        onSubmit={(skillIds) =>
          deployToAgent.mutateAsync({
            agentKey,
            skills: skillIds.map((id) => ({
              id,
              name: library.data?.find((skill) => skill.id === id)?.name ?? id,
            })),
          })
        }
      />
    </div>
  );
}
