import { MANUAL_ONLY_KEY, type Skill, fieldNotesFor, formatNameList } from "@loadout/shared";
import { Info } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export interface AgentFieldNoteProps {
  skill: Pick<Skill, "behaviorFields">;
  agentKey: string;
  agentName: string;
}

/**
 * Frontmatter of the skill that this agent's own documentation says it does not act on. Nothing
 * for an agent Loadout has no documentation for: not being documented is not being ignored.
 */
export function AgentFieldNote({ skill, agentKey, agentName }: AgentFieldNoteProps): ReactNode {
  const { t } = useTranslation();
  const notes = fieldNotesFor(skill.behaviorFields, agentKey);
  const [first] = notes;
  if (!first) return null;
  const fields = formatNameList(notes.map((note) => note.field));
  const ignored = first.level === "ignored";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <p className="flex min-w-0 items-center gap-1 truncate text-xs text-muted-foreground">
          <Info className="size-3 shrink-0" />
          <span className="truncate">
            {t(ignored ? "fieldNotes.ignored" : "fieldNotes.undocumented", { fields })}
          </span>
        </p>
      </TooltipTrigger>
      <TooltipContent className="max-w-72">
        <p>
          {t(ignored ? "fieldNotes.hintIgnored" : "fieldNotes.hintUndocumented", {
            agent: agentName,
          })}
        </p>
        {notes.some((note) => note.field === MANUAL_ONLY_KEY) ? (
          <p className="mt-1">{t("fieldNotes.manualOnly")}</p>
        ) : null}
      </TooltipContent>
    </Tooltip>
  );
}
