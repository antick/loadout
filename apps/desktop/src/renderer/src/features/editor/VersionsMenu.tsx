import { formatBytes, formatDateTime, formatRelative } from "@loadout/shared";
import { History } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useSkillFileVersions } from "@/hooks/queries/skill-files";

export interface VersionsMenuProps {
  skillId: string;
  path: string | null;
  disabled?: boolean;
  /** A version was picked; the caller loads it into the editor. */
  onPick(versionId: string, savedAt: number): void;
}

/** Earlier saved versions of the open file, kept on this computer, newest first. */
export function VersionsMenu({ skillId, path, disabled, onPick }: VersionsMenuProps): ReactNode {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const versions = useSkillFileVersions(skillId, path, open);
  const label = t("editor.versions.button");

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={label} disabled={disabled || !path}>
              <History />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      {/* No focus return on close: it would pop the tooltip up over the editor. */}
      <DropdownMenuContent
        align="end"
        className="w-72"
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span>{t("editor.versions.title")}</span>
          <span className="text-xs font-normal text-muted-foreground">
            {t("editor.versions.hint")}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {versions.isPending ? (
          <div className="flex items-center gap-2 px-2 py-3 text-sm text-muted-foreground">
            <Spinner />
            {t("editor.versions.loading")}
          </div>
        ) : versions.isError ? (
          <p className="px-2 py-3 text-sm text-danger">{t("editor.versions.failed")}</p>
        ) : versions.data.length === 0 ? (
          <p className="px-2 py-3 text-sm text-muted-foreground">{t("editor.versions.empty")}</p>
        ) : (
          <div className="max-h-72 overflow-y-auto">
            {versions.data.map((version) => (
              <DropdownMenuItem
                key={version.id}
                onSelect={() => onPick(version.id, version.savedAt)}
                className="flex items-baseline justify-between gap-3"
              >
                <span className="flex min-w-0 flex-col">
                  <span>{formatRelative(version.savedAt)}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(version.savedAt)}
                  </span>
                </span>
                <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
                  {formatBytes(version.size)}
                </span>
              </DropdownMenuItem>
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
