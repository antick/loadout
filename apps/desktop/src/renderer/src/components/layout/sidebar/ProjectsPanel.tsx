import type { Project } from "@loadout/shared";
import { useNavigate, useParams } from "@tanstack/react-router";
import { ChevronRight, Folder, FolderPlus, Link2, Pin, PinOff } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useConfirm } from "@/components/ConfirmDialog";
import { ProjectSkillList } from "@/components/layout/sidebar/ProjectSkillList";
import { SidebarNavItem } from "@/components/layout/sidebar/SidebarNavItem";
import { SidebarPanel } from "@/components/layout/sidebar/SidebarPanel";
import { useShell } from "@/components/layout/shell-context";
import { SortableList } from "@/components/SortableList";
import { StatusDot } from "@/components/StatusDot";
import { ContextMenuItem, ContextMenuSeparator } from "@/components/ui/context-menu";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
} from "@/components/ui/sidebar";
import {
  useRemoveProject,
  useReorderProjects,
  useRevealProject,
  useSetProjectPinned,
} from "@/hooks/mutations/projects";
import { useProjects } from "@/hooks/queries/projects";
import { usePersistedState } from "@/hooks/use-persisted-state";
import { STORAGE_KEYS } from "@/lib/constants";
import { frequentProjects, pinnedProjects } from "@/lib/project-shortcuts";
import { cn, moveId } from "@/lib/utils";

/** A project needs a look when its folder is gone or a copy has diverged from the library. */
function needsAttention(project: Project): boolean {
  return project.missing || project.syncHealth.diverged > 0;
}

function projectIcon(project: Project): ReactNode {
  return project.type === "linked" ? <Link2 /> : <Folder />;
}

function attentionDot(project: Project, t: ReturnType<typeof useTranslation>["t"]): ReactNode {
  return needsAttention(project) ? (
    <StatusDot
      tone={project.missing ? "danger" : "warning"}
      label={t(project.missing ? "projects.missing" : "projects.diverged")}
    />
  ) : null;
}

/** A labelled group of project links, above the full list: Pinned, Frequent. */
function ShortcutGroup({
  label,
  projects,
  menu,
}: {
  label: string;
  projects: readonly Project[];
  menu: (project: Project) => ReactNode;
}): ReactNode {
  const { t } = useTranslation();
  if (projects.length === 0) return null;
  return (
    <SidebarGroup className="py-1">
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {projects.map((project) => (
            <SidebarMenuItem key={project.id}>
              <SidebarNavItem
                link={{ to: "/projects/$projectId", params: { projectId: project.id } }}
                label={project.name}
                icon={projectIcon(project)}
                badge={project.skillCount}
                indicator={attentionDot(project, t)}
                contextMenu={menu(project)}
              />
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

/**
 * Projects section of the sidebar: pinned and frequently opened projects first, then every
 * project, each opening to list its skills. Drag to reorder, right-click to pin, reveal or
 * remove, "+" to link another.
 */
export function ProjectsPanel(): ReactNode {
  const { t } = useTranslation();
  const shell = useShell();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const params = useParams({ strict: false });
  const projects = useProjects();
  const reorder = useReorderProjects();
  const remove = useRemoveProject();
  const reveal = useRevealProject();
  const setPinned = useSetProjectPinned();
  const items = projects.data ?? [];
  const pinned = pinnedProjects(items);
  const frequent = frequentProjects(items);
  const grouped = pinned.length > 0 || frequent.length > 0;
  // Which projects list their skills. The project on screen starts open.
  const [openState, setOpenState] = usePersistedState<Record<string, boolean>>(
    STORAGE_KEYS.sidebarProjectsOpen,
    {},
  );
  const isOpen = (id: string): boolean => openState[id] ?? id === params.projectId;
  const toggle = (id: string): void =>
    setOpenState((previous) => ({ ...previous, [id]: !(previous[id] ?? id === params.projectId) }));
  const ids = items.map((project) => project.id);

  const askRemove = async (project: Project): Promise<void> => {
    const ok = await confirm({
      title: t("projects.removeTitle", { name: project.name }),
      description: t("projects.removeDescription"),
      items: [project.path],
      confirmLabel: t("projects.remove"),
      destructive: true,
    });
    if (!ok) return;
    remove.mutate(project);
    if (params.projectId === project.id) void navigate({ to: "/projects" });
  };

  const pinItem = (project: Project): ReactNode => (
    <ContextMenuItem
      onSelect={() => setPinned.mutate({ projectId: project.id, pinned: !project.pinned })}
    >
      {project.pinned ? <PinOff /> : <Pin />}
      {t(project.pinned ? "projects.unpin" : "projects.pin")}
    </ContextMenuItem>
  );
  const shortcutMenu = (project: Project): ReactNode => (
    <>
      {pinItem(project)}
      <ContextMenuItem disabled={project.missing} onSelect={() => reveal.mutate(project.id)}>
        {t("common.reveal")}
      </ContextMenuItem>
    </>
  );

  return (
    <SidebarPanel
      title={t("activityBar.projects")}
      action={{ label: t("projects.link"), icon: <FolderPlus />, onClick: shell.openAddProject }}
    >
      <ShortcutGroup label={t("sidebar.projects.pinned")} projects={pinned} menu={shortcutMenu} />
      <ShortcutGroup
        label={t("sidebar.projects.frequent")}
        projects={frequent}
        menu={shortcutMenu}
      />
      <SidebarGroup className="py-1">
        {grouped ? <SidebarGroupLabel>{t("sidebar.projects.all")}</SidebarGroupLabel> : null}
        <SidebarGroupContent>
          <SidebarMenu>
            {projects.isPending ? <SidebarMenuSkeleton showIcon /> : null}
            <SortableList
              items={items}
              itemAs="li"
              itemClassName="group/menu-item relative"
              onReorder={(next) => reorder.mutate(next)}
              renderItem={(project, index) => (
                <>
                  <button
                    type="button"
                    aria-expanded={isOpen(project.id)}
                    aria-label={t(
                      isOpen(project.id) ? "sidebar.projects.hide" : "sidebar.projects.show",
                      {
                        name: project.name,
                      },
                    )}
                    onClick={() => toggle(project.id)}
                    className="absolute top-1.5 left-1 z-10 flex size-5 items-center justify-center rounded text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none"
                  >
                    <ChevronRight
                      className={cn(
                        "size-3.5 transition-transform",
                        isOpen(project.id) && "rotate-90",
                      )}
                    />
                  </button>
                  <SidebarNavItem
                    className="pl-7"
                    link={{ to: "/projects/$projectId", params: { projectId: project.id } }}
                    label={project.name}
                    icon={projectIcon(project)}
                    badge={project.skillCount}
                    indicator={attentionDot(project, t)}
                    contextMenu={
                      <>
                        {pinItem(project)}
                        <ContextMenuItem
                          disabled={project.missing}
                          onSelect={() => reveal.mutate(project.id)}
                        >
                          {t("common.reveal")}
                        </ContextMenuItem>
                        <ContextMenuItem
                          disabled={index === 0}
                          onSelect={() => reorder.mutate(moveId(ids, project.id, -1))}
                        >
                          {t("common.moveUp")}
                        </ContextMenuItem>
                        <ContextMenuItem
                          disabled={index === ids.length - 1}
                          onSelect={() => reorder.mutate(moveId(ids, project.id, 1))}
                        >
                          {t("common.moveDown")}
                        </ContextMenuItem>
                        <ContextMenuSeparator />
                        <ContextMenuItem
                          variant="destructive"
                          onSelect={() => void askRemove(project)}
                        >
                          {t("projects.remove")}
                        </ContextMenuItem>
                      </>
                    }
                  />
                  {isOpen(project.id) && !project.missing ? (
                    <ProjectSkillList projectId={project.id} />
                  ) : null}
                </>
              )}
            />
            {!projects.isPending && items.length === 0 ? (
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip={t("projects.link")}
                  className="text-muted-foreground"
                  onClick={shell.openAddProject}
                >
                  <FolderPlus />
                  <span>{t("projects.link")}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ) : null}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </SidebarPanel>
  );
}
