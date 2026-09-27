import { FilePlus, FolderPlus, Pencil, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { parentOf } from "@/features/editor/file-tree";

/** What can be done to the files of a skill. Absent where files cannot be changed. */
export interface FileActions {
  newFile(folder: string): void;
  newFolder(folder: string): void;
  rename(path: string, folder: boolean): void;
  remove(path: string, folder: boolean): void;
  /** The entry, or a file in it, has unsaved changes: save or discard them first. */
  blocked(path: string): boolean;
}

export interface EditorFileMenuProps {
  path: string;
  /** The entry is a folder: new entries go inside it. */
  folder: boolean;
  /** The skill's main document, which stays where it is. */
  main: boolean;
  actions: FileActions | null;
  /** The entry; must accept a ref and pointer handlers. */
  children: ReactNode;
}

/** Right-click menu of an entry in the editor's file list. */
export function EditorFileMenu({
  path,
  folder,
  main,
  actions,
  children,
}: EditorFileMenuProps): ReactNode {
  const { t } = useTranslation();
  if (!actions) return children;
  const into = folder ? path : parentOf(path);
  const blocked = actions.blocked(path);
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent
        className="min-w-48"
        // Every item opens a dialog, which takes the focus; handing it back here would steal it.
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <ContextMenuItem onSelect={() => actions.newFile(into)}>
          <FilePlus />
          {t("editor.manage.newFile")}
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => actions.newFolder(into)}>
          <FolderPlus />
          {t("editor.manage.newFolder")}
        </ContextMenuItem>
        {main ? null : (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem disabled={blocked} onSelect={() => actions.rename(path, folder)}>
              <Pencil />
              {t("editor.manage.rename")}
            </ContextMenuItem>
            <ContextMenuItem
              variant="destructive"
              disabled={blocked}
              onSelect={() => actions.remove(path, folder)}
            >
              <Trash2 />
              {t("editor.manage.delete")}
            </ContextMenuItem>
            {blocked ? (
              <ContextMenuLabel className="max-w-56 text-xs font-normal text-muted-foreground">
                {t("editor.manage.blocked")}
              </ContextMenuLabel>
            ) : null}
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
