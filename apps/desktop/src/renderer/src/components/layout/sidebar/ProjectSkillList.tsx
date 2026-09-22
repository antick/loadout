import { Link } from "@tanstack/react-router";
import { type ReactNode, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { StatusDot } from "@/components/StatusDot";
import { SidebarMenuSub, SidebarMenuSubButton, SidebarMenuSubItem } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { groupProjectSkills } from "@/features/projects/project-skill-groups";
import { useProjectSkills } from "@/hooks/queries/project-detail";

/** The skills of one project, under its row in the sidebar. Loaded only while it is open. */
export function ProjectSkillList({ projectId }: { projectId: string }): ReactNode {
  const { t } = useTranslation();
  const skills = useProjectSkills(projectId);
  const groups = useMemo(() => groupProjectSkills(skills.data ?? []), [skills.data]);

  return (
    <SidebarMenuSub className="mr-0 pr-0">
      {skills.isPending ? (
        <SidebarMenuSubItem>
          <Skeleton className="my-1 h-5 w-3/4" />
        </SidebarMenuSubItem>
      ) : groups.length === 0 ? (
        <SidebarMenuSubItem className="px-2 py-1 text-xs text-muted-foreground">
          {t("sidebar.projects.empty")}
        </SidebarMenuSubItem>
      ) : (
        groups.map((group) => (
          <SidebarMenuSubItem key={group.id}>
            <SidebarMenuSubButton asChild size="sm">
              <Link
                to="/projects/$projectId"
                params={{ projectId }}
                search={{ skill: group.relativePath }}
                draggable={false}
              >
                <span className="truncate">{group.name}</span>
                {group.syncStatus === "diverged" ? (
                  <StatusDot tone="warning" label={t("projects.diverged")} className="ml-auto" />
                ) : null}
              </Link>
            </SidebarMenuSubButton>
          </SidebarMenuSubItem>
        ))
      )}
    </SidebarMenuSub>
  );
}
