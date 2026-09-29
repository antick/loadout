import {
  type InstallOutcome,
  type InstallOutcomeKind,
  type RepoSkillPreview,
  canReplace,
} from "@loadout/shared";
import { CircleAlert, CirclePlus, RefreshCw, Replace } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ManualOnlyBadge } from "@/components/ManualOnlyBadge";
import { SkillTraitBadges } from "@/components/SkillTraitBadges";
import { StatusBadge, type StatusTone } from "@/components/StatusBadge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const OUTCOME_TONES: Record<InstallOutcomeKind, StatusTone> = {
  new: "success",
  installed: "info",
  taken: "warning",
  repeated: "warning",
  replaces: "info",
};

const OUTCOME_ICONS: Record<InstallOutcomeKind, ReactNode> = {
  new: <CirclePlus />,
  installed: <RefreshCw />,
  taken: <CircleAlert />,
  repeated: <CircleAlert />,
  replaces: <Replace />,
};

/** The chip naming what importing a row does: new, already here, or a name in use. */
export function OutcomeBadge({ kind }: { kind: InstallOutcomeKind }): ReactNode {
  const { t } = useTranslation();
  return (
    <StatusBadge
      tone={OUTCOME_TONES[kind]}
      icon={OUTCOME_ICONS[kind]}
      label={t(`install.git.outcome.${kind}`)}
    />
  );
}

/** One sentence on what happens to a name that is in use; null for a free name. */
function OutcomeHint({ name, outcome }: { name: string; outcome: InstallOutcome }): ReactNode {
  const { t } = useTranslation();
  if (outcome.kind === "new") return null;
  const { installAs, owner } = outcome;
  let text: string;
  if (outcome.kind === "replaces") {
    text = t("install.git.outcomeHint.replaces", { name: installAs });
  } else if (outcome.kind === "installed") {
    text = t("install.git.outcomeHint.installed", { installAs });
  } else if (outcome.kind === "repeated") {
    text = t("install.git.outcomeHint.repeated", { name, installAs });
  } else if (owner?.source) {
    text = t("install.git.outcomeHint.takenFrom", { name, source: owner.source, installAs });
  } else if (owner?.skillId) {
    text = t("install.git.outcomeHint.takenLocal", { name, installAs });
  } else {
    text = t("install.git.outcomeHint.takenFolder", { name, installAs });
  }
  return (
    <p
      className={cn(
        "text-xs break-words",
        OUTCOME_TONES[outcome.kind] === "info" ? "text-info" : "text-warning",
      )}
    >
      {text}
    </p>
  );
}

export interface PreviewRowProps {
  skill: RepoSkillPreview;
  checked: boolean;
  name: string;
  outcome: InstallOutcome;
  /** Show the "New" chip too: only useful when some other row is not new. */
  showNew: boolean;
  onToggle: () => void;
  onRename: (name: string) => void;
  /** Put this skill in place of the library skill holding its name. */
  replacing: boolean;
  onReplaceChange: (replace: boolean) => void;
}

/** A skill found in the source: tick it, rename it, and see what importing it will do. */
export function PreviewRow({
  skill,
  checked,
  name,
  outcome,
  showNew,
  onToggle,
  onRename,
  replacing,
  onReplaceChange,
}: PreviewRowProps): ReactNode {
  const { t } = useTranslation();
  const shownName = name.trim() || skill.name;
  return (
    <li
      data-checked={checked}
      className="flex gap-3 rounded-md border bg-card p-3 transition-colors duration-150 data-[checked=true]:border-primary/40 data-[checked=true]:bg-primary/5"
    >
      <Checkbox
        checked={checked}
        aria-label={t("selection.selectItem", { name: skill.name })}
        className="mt-1.5"
        onCheckedChange={onToggle}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Input
          value={name}
          disabled={!checked}
          aria-label={t("install.git.nameFor", { name: skill.name })}
          placeholder={skill.name}
          className="h-7 px-2 text-sm font-medium"
          onChange={(event) => onRename(event.target.value)}
        />
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <p className="truncate font-mono text-xs text-muted-foreground" title={skill.relPath}>
            {skill.relPath}
          </p>
          {outcome.kind !== "new" || showNew ? <OutcomeBadge kind={outcome.kind} /> : null}
          {skill.manualOnly ? <ManualOnlyBadge /> : null}
          <SkillTraitBadges traits={skill.traits} />
        </div>
        <p className={cn("line-clamp-2 text-xs text-muted-foreground", !checked && "opacity-70")}>
          {skill.description ?? t("skills.noDescription")}
        </p>
        <OutcomeHint name={shownName} outcome={outcome} />
        {checked && canReplace(outcome) ? (
          <label className="flex w-fit cursor-pointer items-center gap-2 text-xs font-medium">
            <Checkbox
              checked={replacing}
              onCheckedChange={(value) => onReplaceChange(value === true)}
            />
            {t("install.git.replaceOwner", { name: outcome.owner?.dirName ?? shownName })}
          </label>
        ) : null}
      </div>
    </li>
  );
}
