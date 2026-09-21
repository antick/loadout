import type { Project } from "@loadout/shared";
import { useNavigate, useParams } from "@tanstack/react-router";
import { Folder, FolderPlus, Link2 } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useConfirm } from "@/components/ConfirmDialog";
import { NavGroup } from "@/components/layout/sidebar/NavGroup";
import { SidebarNavItem } from "@/components/layout/sidebar/SidebarNavItem";
import { useShell } from "@/components/layout/shell-context";
import { SortableList } from "@/components/SortableList";
import { StatusDot } from "@/components/StatusDot";
import { ContextMenuItem, ContextMenuSeparator } from "@/components/ui/context-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
} from "@/components/ui/sidebar";
import { useRemoveProject, useReorderProjects, useRevealProject } from "@/hooks/mutations/projects";
import { useProjects } from "@/hooks/queries/projects";
import { moveId } from "@/lib/utils";

/** A project needs a look when its folder is gone or a copy has diverged from the library. */
function needsAttention(project: Project): boolean {
  return project.missing || project.syncHealth.diverged > 0;
}

/** Linked projects: drag to reorder, right-click to reveal or remove, "+" to link another. */
export function ProjectsGroup(): ReactNode {
  const { t } = useTranslation();
  const shell = useShell();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const params = useParams({ strict: false });
  const projects = useProjects();
  const reorder = useReorderProjects();
  const remove = useRemoveProject();
  const reveal = useRevealProject();
  const items = projects.data ?? [];
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
    if (params.projectId === project.id) void navigate({ to: "/" });
  };

  return (
    <NavGroup
      id="projects"
      label={t("nav.projects")}
      action={{ label: t("projects.link"), icon: <FolderPlus />, onClick: shell.openAddProject }}
    >
      <SidebarMenu>
        {projects.isPending ? <SidebarMenuSkeleton showIcon /> : null}
        <SortableList
          items={items}
          itemAs="li"
          itemClassName="group/menu-item relative"
          onReorder={(next) => reorder.mutate(next)}
          renderItem={(project, index) => (
            <SidebarNavItem
              link={{ to: "/projects/$projectId", params: { projectId: project.id } }}
              label={project.name}
              icon={project.type === "linked" ? <Link2 /> : <Folder />}
              badge={project.skillCount}
              indicator={
                needsAttention(project) ? (
                  <StatusDot
                    tone={project.missing ? "danger" : "warning"}
                    label={t(project.missing ? "projects.missing" : "projects.diverged")}
                  />
                ) : null
              }
              contextMenu={
                <>
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
                  <ContextMenuItem variant="destructive" onSelect={() => void askRemove(project)}>
                    {t("projects.remove")}
                  </ContextMenuItem>
                </>
              }
            />
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
    </NavGroup>
  );
}
