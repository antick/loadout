import { Copy, FolderOpen } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { IconButton } from "@/components/IconButton";
import { useCopyText, useRevealPath } from "@/hooks/mutations/app";
import { useAppInfo } from "@/hooks/queries/app";
import { compactHome } from "@/lib/paths";
import { cn } from "@/lib/utils";

export interface PathTextProps {
  path: string;
  /** Show the copy button (default true). */
  copy?: boolean;
  /** Show the "reveal in file manager" button (default true). */
  reveal?: boolean;
  className?: string;
}

/** A filesystem path in mono with the home folder shortened to `~`, plus copy and reveal. */
export function PathText({
  path,
  copy = true,
  reveal = true,
  className,
}: PathTextProps): ReactNode {
  const { t } = useTranslation();
  const { data: info } = useAppInfo();
  const copyText = useCopyText();
  const revealPath = useRevealPath();

  return (
    <span
      className={cn("group/path inline-flex max-w-full min-w-0 items-center gap-0.5", className)}
    >
      <span
        data-selectable
        title={path}
        className="truncate font-mono text-xs text-muted-foreground"
      >
        {compactHome(path, info?.homeDir)}
      </span>
      <span className="flex shrink-0 opacity-0 transition-opacity group-focus-within/path:opacity-100 group-hover/path:opacity-100">
        {copy ? (
          <IconButton
            size="icon-xs"
            label={t("common.copyPath")}
            icon={<Copy />}
            onClick={() => copyText.mutate(path)}
          />
        ) : null}
        {reveal ? (
          <IconButton
            size="icon-xs"
            label={t("common.reveal")}
            icon={<FolderOpen />}
            onClick={() => revealPath.mutate(path)}
          />
        ) : null}
      </span>
    </span>
  );
}
