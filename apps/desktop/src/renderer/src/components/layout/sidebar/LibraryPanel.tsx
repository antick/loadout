import type { Skill } from "@loadout/shared";
import { Link } from "@tanstack/react-router";
import { CircleDashed, CircleFadingArrowUp, Download, Library, TriangleAlert } from "lucide-react";
import { type ReactNode, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { SidebarNavItem } from "@/components/layout/sidebar/SidebarNavItem";
import { SidebarPanel } from "@/components/layout/sidebar/SidebarPanel";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
} from "@/components/ui/sidebar";
import { hasUpdate, needsAttention, type StatusFilter } from "@/features/library/library-filters";
import { useSkills } from "@/hooks/queries/skills";
import { SIDEBAR_RECENT_SKILLS } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface LibraryView {
  status: StatusFilter;
  icon: ReactNode;
  count(skills: readonly Skill[]): number;
}

/** Shortcuts into the library, each opening it with one status filter applied. */
const VIEWS: readonly LibraryView[] = [
  {
    status: "updates",
    icon: <CircleFadingArrowUp />,
    count: (skills) => skills.filter(hasUpdate).length,
  },
  {
    status: "attention",
    icon: <TriangleAlert />,
    count: (skills) => skills.filter(needsAttention).length,
  },
  {
    status: "not_deployed",
    icon: <CircleDashed />,
    count: (skills) => skills.filter((skill) => skill.deployments.length === 0).length,
  },
];

/** Library section of the sidebar: the library itself, install, quick views and recent skills. */
export function LibraryPanel(): ReactNode {
  const { t } = useTranslation();
  const skills = useSkills();
  const all = skills.data ?? [];
  const recent = useMemo(
    () =>
      [...(skills.data ?? [])]
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, SIDEBAR_RECENT_SKILLS),
    [skills.data],
  );

  return (
    <SidebarPanel title={t("rail.library")}>
      <SidebarGroup className="py-1">
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarNavItem
                link={{ to: "/library" }}
                label={t("sidebar.library.all")}
                icon={<Library />}
                badge={skills.data?.length}
              />
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarNavItem
                link={{ to: "/install" }}
                label={t("sidebar.library.install")}
                icon={<Download />}
              />
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      <SidebarGroup className="py-1">
        <SidebarGroupLabel>{t("sidebar.library.views")}</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {VIEWS.map((view) => {
              const count = view.count(all);
              return (
                <SidebarMenuItem key={view.status}>
                  <SidebarMenuButton asChild className={cn(count === 0 && "opacity-60")}>
                    <Link to="/library" search={{ status: view.status }} draggable={false}>
                      {view.icon}
                      <span className="truncate">{t(`sidebar.library.view.${view.status}`)}</span>
                    </Link>
                  </SidebarMenuButton>
                  {skills.data ? (
                    <SidebarMenuBadge className="text-muted-foreground">{count}</SidebarMenuBadge>
                  ) : null}
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      <SidebarGroup className="py-1">
        <SidebarGroupLabel>{t("sidebar.library.recent")}</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {skills.isPending ? <SidebarMenuSkeleton /> : null}
            {!skills.isPending && recent.length === 0 ? (
              <p className="px-2 py-1 text-xs text-muted-foreground">
                {t("sidebar.library.empty")}
              </p>
            ) : null}
            {recent.map((skill) => (
              <SidebarMenuItem key={skill.id}>
                <SidebarMenuButton asChild size="sm">
                  <Link to="/library" search={{ skill: skill.id }} draggable={false}>
                    <span className="truncate">{skill.name}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </SidebarPanel>
  );
}
