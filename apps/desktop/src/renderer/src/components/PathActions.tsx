import { AppWindow, CodeXml, Copy, FolderOpen } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { IconButton } from "@/components/IconButton";
import { useCopyText, useOpenInEditor, useRevealPath } from "@/hooks/mutations/app";
import { useDefaultEditor } from "@/hooks/use-default-editor";
import { cn } from "@/lib/utils";

export interface PathActionsProps {
  /** Absolute path the buttons act on. */
  path: string;
  /** Show the copy button (default true). */
  copy?: boolean;
  /** Show the "reveal in file manager" button (default true). */
  reveal?: boolean;
  /** Show the "open in editor" button (defaults to `reveal`: both need the path to exist). */
  open?: boolean;
  className?: string;
}

/** Copy a path to the clipboard, show it in the OS file manager, or open it in the editor. */
export function PathActions({
  path,
  copy = true,
  reveal = true,
  open = reveal,
  className,
}: PathActionsProps): ReactNode {
  const { t } = useTranslation();
  const copyText = useCopyText();
  const revealPath = useRevealPath();
  const openInEditor = useOpenInEditor();
  const editor = useDefaultEditor();

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
      {open ? (
        <IconButton
          size="icon-xs"
          label={editor.label}
          icon={editor.id === "system" ? <AppWindow /> : <CodeXml />}
          onClick={() => openInEditor.mutate({ editor: editor.id, path })}
        />
      ) : null}
    </span>
  );
}
