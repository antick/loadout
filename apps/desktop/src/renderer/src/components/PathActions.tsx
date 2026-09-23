import { Copy, FolderOpen } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { IconButton } from "@/components/IconButton";
import { useCopyText, useRevealPath } from "@/hooks/mutations/app";
import { cn } from "@/lib/utils";

export interface PathActionsProps {
  /** Absolute path the buttons act on. */
  path: string;
  /** Show the copy button (default true). */
  copy?: boolean;
  /** Show the "reveal in file manager" button (default true). */
  reveal?: boolean;
  className?: string;
}

/** Copy a path to the clipboard, or show it in the OS file manager. */
export function PathActions({
  path,
  copy = true,
  reveal = true,
  className,
}: PathActionsProps): ReactNode {
  const { t } = useTranslation();
  const copyText = useCopyText();
  const revealPath = useRevealPath();

  return (
    <span className={cn("flex shrink-0", className)}>
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
  );
}
