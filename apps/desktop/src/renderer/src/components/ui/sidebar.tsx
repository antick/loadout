/**
 * The sidebar kit (from shadcn/ui), split to stay readable: this file is the frame (the sidebar,
 * its trigger, inset, separator and content); its state, groups and menus live in
 * `sidebar-context`, `sidebar-group` and `sidebar-menu`. Import everything from here.
 */
import * as React from "react";
import { cn } from "@/lib/utils";
import { PanelLeftIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { i18n } from "@/lib/i18n";
import { useSidebar } from "@/components/ui/sidebar-context";

/** The sidebar itself. It is always a plain column: the shell hides it by width when closed. */
export function Sidebar({ className, children, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar"
      className={cn(
        "flex h-full w-(--sidebar-width) flex-col bg-sidebar text-sidebar-foreground",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function SidebarTrigger({
  className,
  onClick,
  ...props
}: React.ComponentProps<typeof Button>) {
  const { toggleSidebar } = useSidebar();

  return (
    <Button
      data-sidebar="trigger"
      data-slot="sidebar-trigger"
      variant="ghost"
      size="icon"
      className={cn("size-7", className)}
      onClick={(event) => {
        onClick?.(event);
        toggleSidebar();
      }}
      {...props}
    >
      <PanelLeftIcon />
      <span className="sr-only">{i18n.t("common.toggleSidebar")}</span>
    </Button>
  );
}

export function SidebarInset({ className, ...props }: React.ComponentProps<"main">) {
  return (
    <main
      data-slot="sidebar-inset"
      className={cn("relative flex w-full flex-1 flex-col bg-background", className)}
      {...props}
    />
  );
}

export function SidebarSeparator({ className, ...props }: React.ComponentProps<typeof Separator>) {
  return (
    <Separator
      data-slot="sidebar-separator"
      data-sidebar="separator"
      className={cn("mx-2 w-auto bg-sidebar-border", className)}
      {...props}
    />
  );
}

export function SidebarContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-content"
      data-sidebar="content"
      className={cn("flex min-h-0 flex-1 flex-col gap-2 overflow-auto", className)}
      {...props}
    />
  );
}

export { SidebarProvider, useSidebar } from "@/components/ui/sidebar-context";
export {
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
} from "@/components/ui/sidebar-group";
export {
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar-menu";
