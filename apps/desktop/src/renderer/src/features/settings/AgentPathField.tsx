import { Check, FolderOpen, Pencil, Undo2, X } from "lucide-react";
import { type FormEvent, type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { IconButton } from "@/components/IconButton";
import { PathText } from "@/components/PathText";
import { Input } from "@/components/ui/input";
import {
  type AgentPathKind,
  usePickFolder,
  useSetAgentPath,
} from "@/hooks/mutations/settings-page";

export interface AgentPathFieldProps {
  agentKey: string;
  kind: AgentPathKind;
  label: string;
  /** Absolute folder (global) or project-relative folder (project); null when not set. */
  value: string | null;
  /** A built-in agent whose path was changed: offers Reset. */
  overridden: boolean;
  /** Saving an empty value is allowed and clears the path (custom agents' project path). */
  clearable: boolean;
}

/** One of an agent's skill folders: shown as a path, editable in place, resettable when changed. */
export function AgentPathField({
  agentKey,
  kind,
  label,
  value,
  overridden,
  clearable,
}: AgentPathFieldProps): ReactNode {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<string | null>(null);
  const setPath = useSetAgentPath();
  const pickFolder = usePickFolder();
  const editing = draft !== null;

  const save = (event: FormEvent): void => {
    event.preventDefault();
    const next = (draft ?? "").trim();
    if (!next && !clearable) return;
    if (next === (value ?? "")) {
      setDraft(null);
      return;
    }
    setPath.mutate(
      { key: agentKey, kind, path: next || null },
      { onSuccess: () => setDraft(null) },
    );
  };

  const browse = (): void =>
    pickFolder.mutate(label, {
      onSuccess: (picked) => {
        if (picked) setDraft(picked);
      },
    });

  return (
    <div className="grid grid-cols-[8.5rem_minmax(0,1fr)] items-center gap-x-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      {editing ? (
        <form onSubmit={save} className="flex items-center gap-1">
          <Input
            value={draft}
            aria-label={label}
            spellCheck={false}
            className="h-7 px-2 font-mono text-xs"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Escape") return;
              event.stopPropagation();
              setDraft(null);
            }}
          />
          {kind === "global" ? (
            <IconButton
              size="icon-xs"
              label={t("settings.agents.browse")}
              icon={<FolderOpen />}
              onClick={browse}
            />
          ) : null}
          <IconButton
            type="submit"
            size="icon-xs"
            label={t("common.save")}
            icon={<Check />}
            disabled={setPath.isPending}
          />
          <IconButton
            size="icon-xs"
            label={t("common.cancel")}
            icon={<X />}
            onClick={() => setDraft(null)}
          />
        </form>
      ) : (
        <div className="group/field flex min-w-0 items-center gap-0.5">
          {value === null ? (
            <span className="text-xs text-muted-foreground italic">
              {t("settings.agents.notSet")}
            </span>
          ) : kind === "global" ? (
            <PathText path={value} />
          ) : (
            <span data-selectable className="truncate font-mono text-xs text-muted-foreground">
              {value}
            </span>
          )}
          <span className="flex shrink-0 opacity-0 transition-opacity group-focus-within/field:opacity-100 group-hover/field:opacity-100">
            <IconButton
              size="icon-xs"
              label={t("settings.agents.editPath")}
              icon={<Pencil />}
              onClick={() => setDraft(value ?? "")}
            />
            {overridden ? (
              <IconButton
                size="icon-xs"
                label={t("settings.agents.resetPath")}
                icon={<Undo2 />}
                disabled={setPath.isPending}
                onClick={() => setPath.mutate({ key: agentKey, kind, path: null, reset: true })}
              />
            ) : null}
          </span>
        </div>
      )}
    </div>
  );
}
