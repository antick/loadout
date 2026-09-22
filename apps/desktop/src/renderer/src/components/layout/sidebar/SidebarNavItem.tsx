import { Link, type LinkProps, useMatchRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from "@/components/ui/context-menu";
import { SidebarMenuBadge, SidebarMenuButton } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

export interface SidebarNavItemProps {
  link: LinkProps;
  label: string;
  icon: ReactNode;
  /** Count at the right edge. */
  badge?: ReactNode;
  /** Only reveal the badge while the row is hovered or focused. */
  badgeOnHover?: boolean;
  /** Small status dot or icon right after the label. */
  indicator?: ReactNode;
  /** Active only on this exact path (not on child routes). */
  exact?: boolean;
  /** `ContextMenuItem`s for a right-click menu. */
  contextMenu?: ReactNode;
  className?: string;
}

/** One sidebar link with active state, collapsed-mode tooltip, optional badge and context menu. */
export function SidebarNavItem({
  link,
  label,
  icon,
  badge,
  badgeOnHover,
  indicator,
  exact,
  contextMenu,
  className,
}: SidebarNavItemProps): ReactNode {
  const matchRoute = useMatchRoute();
  const active = Boolean(
    matchRoute({ ...link, fuzzy: !exact } as Parameters<typeof matchRoute>[0]),
  );

  const button = (
    <SidebarMenuButton asChild isActive={active} tooltip={label} className={className}>
      <Link {...link} draggable={false}>
        {icon}
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate">{label}</span>
          {indicator}
        </span>
      </Link>
    </SidebarMenuButton>
  );

  return (
    <>
      {contextMenu ? (
        <ContextMenu>
          <ContextMenuTrigger asChild>{button}</ContextMenuTrigger>
          <ContextMenuContent>{contextMenu}</ContextMenuContent>
        </ContextMenu>
      ) : (
        button
      )}
      {badge === undefined || badge === null ? null : (
        <SidebarMenuBadge
          className={cn(
            "text-muted-foreground",
            badgeOnHover &&
              "opacity-0 transition-opacity group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100",
          )}
        >
          {badge}
        </SidebarMenuBadge>
      )}
    </>
  );
}
