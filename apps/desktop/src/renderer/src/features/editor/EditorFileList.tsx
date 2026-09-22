import { formatBytes, type SkillFileEntry } from "@loadout/shared";
import { File, FileLock2, FileText, Folder } from "lucide-react";
import { type ReactNode, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface EditorFileListProps {
  files: readonly SkillFileEntry[];
  activePath: string | null;
  /** Files with unsaved changes, in this session or kept from an earlier one. */
  unsaved: ReadonlySet<string>;
  /** Mark files edited since the skill came from its source (only matters with a source). */
  showEdited: boolean;
  onSelect(path: string): void;
}

interface FolderGroup {
  folder: string;
  files: SkillFileEntry[];
}

/** Files grouped under their folder, in path order; the main document is shown on its own. */
function groupByFolder(files: readonly SkillFileEntry[]): FolderGroup[] {
  const groups = new Map<string, SkillFileEntry[]>();
  for (const file of files) {
    if (file.main) continue;
    const slash = file.path.lastIndexOf("/");
    const folder = slash === -1 ? "" : file.path.slice(0, slash);
    groups.set(folder, [...(groups.get(folder) ?? []), file]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === "" ? -1 : b === "" ? 1 : a.localeCompare(b)))
    .map(([folder, entries]) => ({ folder, files: entries }));
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
  const name = file.path.slice(file.path.lastIndexOf("/") + 1);
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
      <span className="min-w-0 flex-1 truncate font-mono text-xs">{name}</span>
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

/** The skill's files on the left of the editor. Binary and oversized files are listed, locked. */
export function EditorFileList({
  files,
  activePath,
  unsaved,
  showEdited,
  onSelect,
}: EditorFileListProps): ReactNode {
  const { t } = useTranslation();
  const main = files.find((file) => file.main) ?? null;
  const groups = useMemo(() => groupByFolder(files), [files]);

  return (
    <nav aria-label={t("editor.files.label")} className="flex flex-col gap-3 p-2">
      {main ? (
        <FileRow
          file={main}
          active={main.path === activePath}
          unsaved={unsaved.has(main.path)}
          showEdited={showEdited}
          indent={false}
          onSelect={onSelect}
        />
      ) : null}
      {groups.length > 0 ? (
        <div className="flex flex-col gap-0.5">
          <h2 className="px-2 pb-1 text-[0.6875rem] font-medium tracking-wider text-muted-foreground uppercase">
            {t("editor.files.other")}
          </h2>
          {groups.map((group) => (
            <div key={group.folder || "."} className="flex flex-col gap-0.5">
              {group.folder ? (
                <div className="flex h-7 items-center gap-2 px-2 text-xs text-muted-foreground">
                  <Folder className="size-3.5 shrink-0" />
                  <span className="truncate font-mono">{group.folder}</span>
                </div>
              ) : null}
              {group.files.map((file) => (
                <FileRow
                  key={file.path}
                  file={file}
                  active={file.path === activePath}
                  unsaved={unsaved.has(file.path)}
                  showEdited={showEdited}
                  indent={Boolean(group.folder)}
                  onSelect={onSelect}
                />
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </nav>
  );
}
