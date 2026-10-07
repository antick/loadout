import { type InstructionFile, formatRelative, formatNameList } from "@loadout/shared";
import { useNavigate } from "@tanstack/react-router";
import { FileText, Plus } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAppInfo } from "@/hooks/queries/app";
import { compactHome } from "@/lib/paths";
import { editLink, instructionLocation } from "@/lib/skill-location";
import { cn } from "@/lib/utils";
import { SECTION_LABEL } from "@/lib/styles";

export interface InstructionFilesSectionProps {
  /** Undefined while loading; the section stays hidden until there is a file to show. */
  files: readonly InstructionFile[] | undefined;
  /** Name the agents reading each file (a project has several; one agent's page does not). */
  showReaders: boolean;
}

/**
 * The instruction files (`CLAUDE.md`, `AGENTS.md`, …) of an agent or a project, one pill each. A
 * pill opens the file in the editor. One that does not exist yet opens empty, and nothing is
 * written until it is saved there.
 */
export function InstructionFilesSection({
  files,
  showReaders,
}: InstructionFilesSectionProps): ReactNode {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: info } = useAppInfo();
  if (!files || files.length === 0) return null;

  return (
    <section className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-dashed px-3 py-2">
      <h2 className={SECTION_LABEL}>{t("instructions.label")}</h2>
      <ul className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
        {files.map((file) => {
          const readers = formatNameList(file.readers.map((reader) => reader.agentName));
          return (
            <li key={file.path}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => void navigate(editLink(instructionLocation(file)))}
                    className={cn(
                      "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 py-0 text-xs font-medium transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                      file.exists
                        ? "border-border bg-card text-foreground hover:border-primary/40"
                        : "border-dashed border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
                    )}
                  >
                    {file.exists ? (
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
