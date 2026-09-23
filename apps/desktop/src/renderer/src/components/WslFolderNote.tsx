import { wslDistroOf } from "@loadout/shared";
import { Copy, Info } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useAppInfo } from "@/hooks/queries/app";
import { cn } from "@/lib/utils";

export interface WslFolderNoteProps {
  /** The agent skills folder being shown or typed. */
  path: string;
  /** On Windows, explain how to point at a WSL folder while `path` is not one yet. */
  hint?: boolean;
  className?: string;
}

/**
 * Under an agent's skills folder: for a folder inside WSL, that skills are copied there rather
 * than linked; with `hint`, on Windows only, how to enter such a folder.
 */
export function WslFolderNote({ path, hint = false, className }: WslFolderNoteProps): ReactNode {
  const { t } = useTranslation();
  const info = useAppInfo();
  const distro = wslDistroOf(path);
  const showHint = hint && !distro && info.data?.platform === "win32";
  if (!distro && !showHint) return null;
  const Icon = distro ? Copy : Info;
  return (
    <p className={cn("flex items-start gap-1.5 text-xs text-muted-foreground", className)}>
      <Icon className="mt-0.5 size-3 shrink-0" />
      <span>{distro ? t("agents.wsl.copies", { distro }) : t("agents.wsl.hint")}</span>
    </p>
  );
}
