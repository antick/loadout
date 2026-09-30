import {
  type Skill,
  type SkillUsage,
  groupSkillSources,
  isUnusedSkill,
  usageById,
} from "@loadout/shared";
import { Link } from "@tanstack/react-router";
import { ITEM_KINDS } from "@loadout/shared";
import {
  CircleDashed,
  CircleFadingArrowUp,
  Download,
  GitFork,
  Hourglass,
  Library,
  Star,
  TriangleAlert,
} from "lucide-react";
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
import {
  hasUpdate,
  isFavorite,
  needsAttention,
  type StatusFilter,
} from "@/features/library/library-filters";
import type { LibrarySearch } from "@/routes/library";
import { useSkills } from "@/hooks/queries/skills";
import { useUsageReport } from "@/hooks/queries/usage";
import { useAllItems } from "@/hooks/queries/items";
import { KIND_ICONS } from "@/features/items/ItemsPage";
import { SIDEBAR_RECENT_SKILLS } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface LibraryView {
  /** Label key under `sidebar.library.view`, and the React key. */
  id: StatusFilter | "favorites";
  /** What the library opens with. */
  search: LibrarySearch;
  icon: ReactNode;
  count(skills: readonly Skill[], usage: ReadonlyMap<string, SkillUsage>): number;
  /** Shown only while usage tracking is on. */
  needsUsage?: boolean;
}

/** Shortcuts into the library, each opening it with one filter applied. */
const VIEWS: readonly LibraryView[] = [
  {
    id: "favorites",
    search: { favorites: true },
    icon: <Star />,
    count: (skills) => skills.filter(isFavorite).length,
  },
  {
    id: "updates",
    search: { status: "updates" },
    icon: <CircleFadingArrowUp />,
    count: (skills) => skills.filter(hasUpdate).length,
  },
  {
    id: "attention",
    search: { status: "attention" },
    icon: <TriangleAlert />,
    count: (skills) => skills.filter(needsAttention).length,
  },
  {
    id: "not_deployed",
    search: { status: "not_deployed" },
    icon: <CircleDashed />,
    count: (skills) => skills.filter((skill) => skill.deployments.length === 0).length,
  },
  {
    id: "unused",
    search: { status: "unused" },
    icon: <Hourglass />,
    count: (skills, usage) => skills.filter((skill) => isUnusedSkill(skill, usage)).length,
    needsUsage: true,
  },
];

/** Library section of the sidebar: the library itself, install, quick views and recent skills. */
export function LibraryPanel(): ReactNode {
  const { t } = useTranslation();
  const skills = useSkills();
  const items = useAllItems();
  const usageReport = useUsageReport();
  const usage = useMemo(() => usageById(usageReport.data), [usageReport.data]);
  const usageEnabled = usageReport.data?.enabled === true;
  const all = skills.data ?? [];
  const sourceCount = useMemo(() => groupSkillSources(skills.data ?? []).length, [skills.data]);
  const recent = useMemo(
    () =>
      [...(skills.data ?? [])]
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, SIDEBAR_RECENT_SKILLS),
    [skills.data],
  );

  return (
    <SidebarPanel title={t("activityBar.library")}>
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
                link={{ to: "/sources" }}
                label={t("sidebar.library.sources")}
                icon={<GitFork />}
                badge={skills.data ? sourceCount : undefined}
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
        <SidebarGroupLabel>{t("sidebar.library.agentFiles")}</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {ITEM_KINDS.map((kind) => {
              const Icon = KIND_ICONS[kind];
              return (
                <SidebarMenuItem key={kind}>
                  <SidebarNavItem
                    link={{ to: "/items/$kind", params: { kind } }}
                    label={t(`items.kinds.${kind}.title`)}
                    icon={<Icon />}
                    badge={items.data?.filter((item) => item.kind === kind).length}
                  />
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      <SidebarGroup className="py-1">
        <SidebarGroupLabel>{t("sidebar.library.views")}</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {VIEWS.filter((view) => usageEnabled || !view.needsUsage).map((view) => {
              const count = view.count(all, usage);
              return (
                <SidebarMenuItem key={view.id}>
                  <SidebarMenuButton asChild className={cn(count === 0 && "opacity-60")}>
                    <Link to="/library" search={view.search} draggable={false}>
                      {view.icon}
                      <span className="truncate">{t(`sidebar.library.view.${view.id}`)}</span>
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
