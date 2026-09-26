import { Bug, ScrollText, Tag } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { STATUS_BAR_ITEM_CLASS } from "@/components/layout/status-bar/StatusBarItem";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAppLinks } from "@/hooks/use-app-links";
import { cn } from "@/lib/utils";

/** The running version at the right end of the status bar: release notes and bug reports. */
export function VersionMenu(): ReactNode {
  const { t } = useTranslation();
  const links = useAppLinks();
  if (!links.version) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t("appLinks.menuLabel", { version: links.version })}
        className={cn(STATUS_BAR_ITEM_CLASS, "text-muted-foreground hover:text-foreground")}
      >
        <Tag />
        <span>{t("appLinks.version", { version: links.version })}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="end" className="w-56">
        <DropdownMenuLabel>{t("appLinks.menuLabel", { version: links.version })}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={links.openReleaseNotes}>
          <ScrollText />
          {t("appLinks.releaseNotes")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={links.reportBug} title={t("appLinks.reportBugHint")}>
          <Bug />
          {t("appLinks.reportBug")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
