import { type InstructionFile, formatRelative } from "@loadout/shared";
import { useNavigate } from "@tanstack/react-router";
import { FileText, Plus } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useCreateInstructionFile } from "@/hooks/mutations/instructions";
import { useAppInfo } from "@/hooks/queries/app";
import { compactHome } from "@/lib/paths";
import { editLink, instructionLocation, locationKey } from "@/lib/skill-location";
import { cn } from "@/lib/utils";

export interface InstructionFilesSectionProps {
  /** Undefined while loading; the section stays hidden until there is a file to show. */
  files: readonly InstructionFile[] | undefined;
  /** Name the agents reading each file (a project has several; one agent's page does not). */
  showReaders: boolean;
}

/**
 * The instruction files (`CLAUDE.md`, `AGENTS.md`, …) of an agent or a project, one pill each. A
 * pill opens the file in the editor; a file that does not exist yet is created first.
 */
export function InstructionFilesSection({
  files,
  showReaders,
}: InstructionFilesSectionProps): ReactNode {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: info } = useAppInfo();
  const create = useCreateInstructionFile();
  if (!files || files.length === 0) return null;

  const open = async (file: InstructionFile): Promise<void> => {
    const location = instructionLocation(file);
    if (!file.exists) await create.mutateAsync(location);
    await navigate(editLink(location));
  };

  return (
    <section className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-dashed px-3 py-2">
      <h2 className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
        {t("instructions.label")}
      </h2>
      <ul className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
        {files.map((file) => {
          const key = locationKey(instructionLocation(file));
          const busy =
            create.isPending && create.variables && locationKey(create.variables) === key;
          const readers = file.readers.map((reader) => reader.agentName).join(", ");
          return (
            <li key={file.path}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    disabled={create.isPending}
                    onClick={() => void open(file).catch(() => undefined)}
                    className={cn(
                      "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 py-0 text-xs font-medium transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60",
                      file.exists
                        ? "border-border bg-card text-foreground hover:border-primary/40"
                        : "border-dashed border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
                    )}
                  >
                    {busy ? (
                      <Spinner className="size-3" />
                    ) : file.exists ? (
                      <FileText className="size-3.5" />
                    ) : (
                      <Plus className="size-3.5" />
                    )}
                    <span className="font-mono">{file.name}</span>
                    {showReaders ? (
                      <span className="max-w-48 truncate font-normal text-muted-foreground">
                        {readers}
                      </span>
                    ) : null}
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-80">
                  <p className="font-mono break-all">{compactHome(file.path, info?.homeDir)}</p>
                  {file.linkTarget ? (
                    <p className="opacity-80">
                      {t("instructions.linkedTo", { target: file.linkTarget })}
                    </p>
                  ) : null}
                  <p className="opacity-80">{t("instructions.readBy", { agents: readers })}</p>
                  <p className="opacity-80">
                    {file.exists
                      ? t("instructions.changed", { when: formatRelative(file.modifiedAt) })
                      : t("instructions.createHint")}
                  </p>
                </TooltipContent>
              </Tooltip>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
