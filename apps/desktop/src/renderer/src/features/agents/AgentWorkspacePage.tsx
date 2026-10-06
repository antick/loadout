import { isAgentAvailable, type LocalSkill } from "@loadout/shared";
import { Navigate } from "@tanstack/react-router";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AddFromLibrarySheet } from "@/components/AddFromLibrarySheet";
import { PageHeader } from "@/components/layout/PageHeader";
import { SelectionToolbar } from "@/components/SelectionToolbar";
import { useDeployToAgent, useRefreshWorkspace } from "@/features/agents/workspace-mutations";
import { InstructionFilesSection } from "@/features/instructions/InstructionFilesSection";
import {
  useBrokenFolders,
  usePluginSkills,
  useSkillListing,
  useWorkspaceDocument,
  useWorkspaceSkills,
} from "@/features/agents/workspace-queries";
import { type LocalSkillView, toLocalSkillView } from "@/features/local-skills/local-skill-view";
import { LinkBadge } from "@/features/local-skills/LinkBadge";
import { LocalSkillDetailSheet } from "@/features/local-skills/LocalSkillDetailSheet";
import { LocalSkillList } from "@/features/local-skills/LocalSkillList";
import { LocalSkillToolbar } from "@/features/local-skills/LocalSkillToolbar";
import {
  AddButton,
  LocalSkillPage,
  RefreshButton,
  SelectButton,
} from "@/features/local-skills/LocalSkillWorkspace";
import { SkillActionButtons } from "@/features/local-skills/SkillActionButtons";
import { SkillActionMenu } from "@/features/local-skills/SkillActionMenu";
import { useLocalSkillFilters } from "@/features/local-skills/use-local-skill-filters";
import { useAgentNames, useAgents } from "@/hooks/queries/agents";
import { useInstructionFiles } from "@/hooks/queries/instructions";
import { useLastDefined } from "@/hooks/use-last-defined";
import { useSelection } from "@/hooks/use-selection";
import { useViewMode } from "@/hooks/use-view-mode";
import { summarizeAgentFolder } from "./agent-skill-rules";
import { AgentPresetBar } from "./AgentPresetBar";
import { AgentSelectionActions } from "./AgentSelectionActions";
import { AgentWorkspaceHeader } from "./AgentWorkspaceHeader";
import { BrokenFoldersNotice } from "./BrokenFoldersNotice";
import { ListingBudgetCard } from "./ListingBudgetCard";
import { PluginSkillsSection } from "./PluginSkillsSection";
import { useAgentSkillActions } from "./use-agent-skill-actions";

const VIEW_MODE_SCOPE = "agent-workspace";

/** Everything inside one agent's global skills folder, managed or not. */
export function AgentWorkspacePage({ agentKey }: { agentKey: string }): ReactNode {
  const { t } = useTranslation();
  const agents = useAgents();
  const names = useAgentNames();
  const workspace = useWorkspaceSkills(agentKey);
  const broken = useBrokenFolders(agentKey);
  const plugins = usePluginSkills(agentKey);
  const listing = useSkillListing(agentKey);
  const refresh = useRefreshWorkspace();
  const deployToAgent = useDeployToAgent();
  const [openPath, setOpenPath] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [viewMode, setViewMode] = useViewMode(VIEW_MODE_SCOPE);

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

  return (
    <LocalSkillPage>
      <PageHeader
        title={agentName}
        breadcrumbs={[{ label: t("nav.agents"), to: "/agents" }]}
        subtitle={
          workspace.data ? t("agents.skillCount", { count: workspace.data.length }) : undefined
        }
        actions={
          <>
            <RefreshButton
              label={t("agents.workspace.refresh")}
              onRefresh={() => refresh(agentKey)}
            />
            <SelectButton
              label={t("agents.workspace.select")}
              selection={selection}
              disabled={views.length === 0}
            />
            <AddButton label={t("agents.workspace.addSkills")} onClick={() => setAdding(true)} />
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
      {listing.data ? <ListingBudgetCard report={listing.data} /> : null}
      <BrokenFoldersNotice agentKey={agentKey} agentName={agentName} folders={broken.data} />

      <LocalSkillToolbar
        filters={filters}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        searchPlaceholder={t("agents.workspace.search")}
        total={views.length}
      />

      <SelectionToolbar selection={selection}>
        <AgentSelectionActions
          agentKey={agentKey}
          agentName={agentName}
          selected={selectedSkills}
          onDone={selection.exit}
        />
      </SelectionToolbar>

      <LocalSkillList
        status={workspace}
        items={views}
        filters={filters}
        viewMode={viewMode}
        selection={selection}
        emptyTitle={t("agents.workspace.emptyTitle")}
        emptyDescription={t("agents.workspace.emptyDescription", { agent: agentName })}
        addLabel={t("agents.workspace.addSkills")}
        onAdd={() => setAdding(true)}
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

      <PluginSkillsSection agentName={agentName} plugins={plugins.data} local={workspace.data} />

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
        onSubmit={(skillIds) => deployToAgent(agentKey, skillIds)}
      />
    </LocalSkillPage>
  );
}
