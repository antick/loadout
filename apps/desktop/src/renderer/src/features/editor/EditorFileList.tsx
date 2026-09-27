import { formatBytes, type SkillFileEntry } from "@loadout/shared";
import { File, FileLock2, FilePlus, FileText, Folder, FolderPlus } from "lucide-react";
import { type ReactNode, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { IconButton } from "@/components/IconButton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { EditorFileMenu, type FileActions } from "@/features/editor/EditorFileMenu";
import { groupByFolder, nameOf } from "@/features/editor/file-tree";
import { cn } from "@/lib/utils";

export interface EditorFileListProps {
  files: readonly SkillFileEntry[];
  /** Every folder of the skill, so empty ones show too. */
  folders: readonly string[];
  activePath: string | null;
  /** Files with unsaved changes, in this session or kept from an earlier one. */
  unsaved: ReadonlySet<string>;
  /** Mark files edited since the skill came from its source (only matters with a source). */
  showEdited: boolean;
  /** New file, new folder, rename and delete; null where files cannot be changed. */
  actions: FileActions | null;
  onSelect(path: string): void;
}

function FileRow({
  file,
  active,
  unsaved,
  showEdited,
  indent,
  onSelect,
}: {
  file: SkillFileEntry;
  active: boolean;
  unsaved: boolean;
  showEdited: boolean;
  indent: boolean;
  onSelect(path: string): void;
}): ReactNode {
  const { t } = useTranslation();
  const Icon = file.locked ? FileLock2 : file.main ? FileText : File;
  const row = (
    <button
      type="button"
      disabled={file.locked !== null}
      aria-current={active ? "page" : undefined}
      onClick={() => onSelect(file.path)}
      className={cn(
        "group flex h-7 w-full items-center gap-2 rounded-md pr-2 text-left text-sm transition-colors",
        indent ? "pl-6" : "pl-2",
        active
          ? "bg-accent font-medium text-accent-foreground"
          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent",
      )}
    >
      <Icon className={cn("size-3.5 shrink-0", file.main && !file.locked && "text-primary")} />
      <span className="min-w-0 flex-1 truncate font-mono text-xs">{nameOf(file.path)}</span>
      {unsaved ? (
        <span className="flex shrink-0 items-center">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-warning" />
          <span className="sr-only">{t("editor.files.unsaved")}</span>
        </span>
      ) : showEdited && file.edited ? (
        <span className="shrink-0 text-[0.625rem] tracking-wide text-muted-foreground uppercase">
          {t("editor.files.edited")}
        </span>
      ) : null}
    </button>
  );
  if (!file.locked) return row;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* A disabled button fires no pointer events; the wrapper carries the tooltip. */}
        <span className="block">{row}</span>
      </TooltipTrigger>
      <TooltipContent side="right">
        {t(`editor.files.locked.${file.locked}`, { size: formatBytes(file.size) })}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * The skill's files on the left of the editor. Binary and oversized files are listed, locked.
 * Library skills also get New file and New folder, and a right-click menu on every entry.
 */
export function EditorFileList({
  files,
  folders,
  activePath,
  unsaved,
  showEdited,
  actions,
  onSelect,
}: EditorFileListProps): ReactNode {
  const { t } = useTranslation();
  const main = files.find((file) => file.main) ?? null;
  const groups = useMemo(() => groupByFolder(files, folders), [files, folders]);

  const row = (file: SkillFileEntry, indent: boolean): ReactNode => (
    <EditorFileMenu
      key={file.path}
      path={file.path}
      folder={false}
      main={file.main}
      actions={actions}
    >
      {/* The menu needs an element of its own: a locked row is wrapped for its tooltip. */}
      <div className="rounded-md data-[state=open]:bg-accent/60">
        <FileRow
          file={file}
          active={file.path === activePath}
          unsaved={unsaved.has(file.path)}
          showEdited={showEdited}
          indent={indent}
          onSelect={onSelect}
        />
      </div>
    </EditorFileMenu>
  );

  return (
    <nav aria-label={t("editor.files.label")} className="flex flex-col gap-3 p-2">
      {main ? row(main, false) : null}
      {groups.length > 0 || actions ? (
        <div className="flex flex-col gap-0.5">
          <div className="flex h-7 items-center gap-1 pr-1 pl-2">
            <h2 className="flex-1 text-[0.6875rem] font-medium tracking-wider text-muted-foreground uppercase">
              {t("editor.files.other")}
            </h2>
            {actions ? (
              <>
                <IconButton
                  label={t("editor.manage.newFile")}
                  icon={<FilePlus />}
                  className="size-6"
                  onClick={() => actions.newFile("")}
                />
                <IconButton
                  label={t("editor.manage.newFolder")}
                  icon={<FolderPlus />}
                  className="size-6"
                  onClick={() => actions.newFolder("")}
                />
              </>
            ) : null}
          </div>
          {groups.map((group) => (
            <div key={group.folder || "."} className="flex flex-col gap-0.5">
              {group.folder ? (
                <EditorFileMenu path={group.folder} folder main={false} actions={actions}>
                  <div className="flex h-7 items-center gap-2 rounded-md px-2 text-xs text-muted-foreground data-[state=open]:bg-accent/60">
                    <Folder className="size-3.5 shrink-0" />
                    <span className="truncate font-mono">{group.folder}</span>
                  </div>
                </EditorFileMenu>
              ) : null}
              {group.files.map((file) => row(file, Boolean(group.folder)))}
            </div>
          ))}
        </div>
      ) : null}
    </nav>
  );
}
