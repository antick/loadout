import type { EditTarget, SkillFileEntry } from "@loadout/shared";
import { Link, type LinkProps } from "@tanstack/react-router";
import { ChevronLeft, Copy } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { SidebarHeaderPortal } from "@/components/layout/SidebarHeaderPortal";
import { useIsMac } from "@/components/layout/WindowDragRegion";
import { SidebarContent, SidebarSeparator } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { EditorFileList } from "@/features/editor/EditorFileList";
import { ACTIVITY_BAR_WIDTH_PX, MAC_WINDOW_CONTROLS_WIDTH_PX } from "@/lib/constants";

export interface EditorSidebarProps {
  target: EditTarget;
  /** Where "back" goes, and what it is called. */
  backLink: LinkProps;
  backLabel: string;
  files: readonly SkillFileEntry[] | undefined;
  activePath: string | null;
  unsaved: ReadonlySet<string>;
  showEdited: boolean;
  onSelect(path: string): void;
}

/**
 * The sidebar while a skill is edited: a way back, which skill this is and where it lives, and
 * its files. It replaces the section list, so the editor needs no file column of its own.
 */
export function EditorSidebar({
  target,
  backLink,
  backLabel,
  files,
  activePath,
  unsaved,
  showEdited,
  onSelect,
}: EditorSidebarProps): ReactNode {
  const { t } = useTranslation();
  const isMac = useIsMac();
  const inset = isMac ? MAC_WINDOW_CONTROLS_WIDTH_PX - ACTIVITY_BAR_WIDTH_PX : undefined;

  const back = (
    <Link
      {...backLink}
      className="app-no-drag inline-flex h-7 min-w-0 items-center gap-1 rounded-md px-1.5 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none"
    >
      <ChevronLeft className="size-4 shrink-0" />
      <span className="truncate">{backLabel}</span>
    </Link>
  );
  const header = (
    <div
      className="flex h-full w-(--sidebar-width) items-center pr-2 pl-2"
      style={inset ? { paddingLeft: inset - 8 } : undefined}
    >
      {back}
    </div>
  );

  return (
    <>
      <SidebarHeaderPortal header={header} folded={back} />
      <SidebarContent className="gap-0 pb-3">
        <div className="px-4 pt-3 pb-2">
          <p data-selectable className="truncate text-sm font-semibold tracking-tight">
            {target.name}
          </p>
          <p data-selectable className="truncate text-xs text-muted-foreground">
            {target.placeLabel}
          </p>
        </div>
        <SidebarSeparator className="mx-3 data-[orientation=horizontal]:w-auto" />
        {files ? (
          <EditorFileList
            files={files}
            activePath={activePath}
            unsaved={unsaved}
            showEdited={showEdited}
            onSelect={onSelect}
          />
        ) : (
          <div className="flex flex-col gap-2 p-3">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-4/5" />
            <Skeleton className="h-6 w-3/5" />
          </div>
        )}
        {target.otherCopies.length > 0 ? (
          <p className="mx-4 mt-auto flex items-start gap-2 border-t pt-3 text-xs text-muted-foreground">
            <Copy className="mt-0.5 size-3.5 shrink-0" />
            <span>
              {t("editor.sidebar.copies", {
                count: target.otherCopies.length,
                agents: target.otherCopies.map((copy) => copy.agentName).join(", "),
              })}
            </span>
          </p>
        ) : null}
      </SidebarContent>
    </>
  );
}
