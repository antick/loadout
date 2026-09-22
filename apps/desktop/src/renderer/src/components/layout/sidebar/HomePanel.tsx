import { Link } from "@tanstack/react-router";
import {
  BookOpen,
  CloudUpload,
  FolderPlus,
  LayoutDashboard,
  PackagePlus,
  Plus,
  ScanSearch,
} from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { SidebarNavItem } from "@/components/layout/sidebar/SidebarNavItem";
import { SidebarPanel } from "@/components/layout/sidebar/SidebarPanel";
import { useShell } from "@/components/layout/shell-context";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

/** Home section of the sidebar: the dashboard, the usual first steps, and the guide. */
export function HomePanel(): ReactNode {
  const { t } = useTranslation();
  const shell = useShell();

  return (
    <SidebarPanel title={t("activityBar.home")}>
      <SidebarGroup className="py-1">
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarNavItem
                link={{ to: "/" }}
                exact
                label={t("nav.dashboard")}
                icon={<LayoutDashboard />}
              />
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      <SidebarGroup className="py-1">
        <SidebarGroupLabel>{t("sidebar.home.start")}</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild>
                <Link to="/install" draggable={false}>
                  <PackagePlus />
                  <span>{t("sidebar.home.install")}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton asChild>
                <Link to="/install" search={{ tab: "scan" }} draggable={false}>
                  <ScanSearch />
                  <span>{t("sidebar.home.scan")}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={shell.openAddProject}>
                <FolderPlus />
                <span>{t("sidebar.home.linkProject")}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={() => shell.openPresetDialog()}>
                <Plus />
                <span>{t("sidebar.home.newPreset")}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton asChild>
                <Link to="/backup" draggable={false}>
                  <CloudUpload />
                  <span>{t("sidebar.home.backup")}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      <SidebarGroup className="py-1">
        <SidebarGroupLabel>{t("sidebar.home.learn")}</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={shell.openHelp}>
                <BookOpen />
                <span>{t("sidebar.home.guide")}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </SidebarPanel>
  );
}
