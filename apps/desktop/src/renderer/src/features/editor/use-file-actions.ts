import type { SkillFileEntry, SkillLocation } from "@loadout/shared";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useConfirm } from "@/components/ConfirmDialog";
import {
  useCreateSkillFile,
  useCreateSkillFolder,
  useDeleteSkillFile,
  useRenameSkillFile,
} from "@/features/editor/editor-mutations";
import type { FileActions } from "@/features/editor/EditorFileMenu";
import type { FileNameDialogProps, NameRequest } from "@/features/editor/FileNameDialog";
import { isWithin, movedPath, nameOf, takenPaths } from "@/features/editor/file-tree";

export interface FileActionsOptions {
  location: SkillLocation;
  /** Files can be created, renamed and deleted here (library skills). */
  enabled: boolean;
  files: readonly SkillFileEntry[];
  folders: readonly string[];
  /** Paths with unsaved changes: those, and folders holding them, stay put until saved. */
  unsaved: ReadonlySet<string>;
  activePath: string | null;
  onOpenFile(path: string): void;
}

export interface FileActionsState {
  /** Null where files cannot be changed. */
  actions: FileActions | null;
  dialog: FileNameDialogProps;
}

/**
 * New file, new folder, rename and delete for the editor's file list. The open file follows a
 * rename; when it is deleted, the main document opens instead.
 */
export function useFileActions({
  location,
  enabled,
  files,
  folders,
  unsaved,
  activePath,
  onOpenFile,
}: FileActionsOptions): FileActionsState {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const createFile = useCreateSkillFile();
  const createFolder = useCreateSkillFolder();
  const rename = useRenameSkillFile();
  const remove = useDeleteSkillFile();
  const [request, setRequest] = useState<NameRequest | null>(null);
  const taken = useMemo(() => takenPaths(files, folders), [files, folders]);
  const mainPath = files.find((file) => file.main)?.path ?? null;

  const close = (): void => setRequest(null);

  const submit = (path: string): void => {
    if (!request) return;
    if (request.kind === "file") {
      createFile.mutate(
        { location, path },
        {
          onSuccess: (result) => {
            close();
            onOpenFile(result.path);
          },
        },
      );
    } else if (request.kind === "folder") {
      createFolder.mutate({ location, path }, { onSuccess: close });
    } else {
      const from = request.path;
      rename.mutate(
        { location, from, to: path },
        {
          onSuccess: (result) => {
            close();
            const moved = activePath ? movedPath(activePath, from, result.path) : null;
            if (moved) onOpenFile(moved);
          },
        },
      );
    }
  };

  const removeEntry = async (path: string, folder: boolean): Promise<void> => {
    const inside = files.filter((file) => isWithin(file.path, path)).map((file) => file.path);
    const confirmed = await confirm({
      title: t(folder ? "editor.manage.confirm.folderTitle" : "editor.manage.confirm.fileTitle", {
        name: nameOf(path),
      }),
      description: folder
        ? t("editor.manage.confirm.folderDescription", { count: inside.length })
        : t("editor.manage.confirm.fileDescription"),
      items: folder ? inside : undefined,
      confirmLabel: t("editor.manage.delete"),
      destructive: true,
    });
    if (!confirmed) return;
    remove.mutate(
      { location, path },
      {
        onSuccess: () => {
          if (activePath && isWithin(activePath, path) && mainPath) onOpenFile(mainPath);
        },
      },
    );
  };

  const actions: FileActions = {
    newFile: (folder) => setRequest({ kind: "file", folder }),
    newFolder: (folder) => setRequest({ kind: "folder", folder }),
    rename: (path, folder) => setRequest({ kind: "rename", path, folder }),
    remove: (path, folder) => void removeEntry(path, folder),
    blocked: (path) => [...unsaved].some((dirty) => isWithin(dirty, path)),
  };

  return {
    actions: enabled ? actions : null,
    dialog: {
      request,
      taken,
      busy: createFile.isPending || createFolder.isPending || rename.isPending,
      onSubmit: submit,
      onClose: close,
    },
  };
}
