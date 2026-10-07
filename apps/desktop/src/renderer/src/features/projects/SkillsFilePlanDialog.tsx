import {
  SKILLS_FILE_NAME,
  type SkillsFileAction,
  type SkillsFileEntry,
  type SkillsFilePlan,
  formatRevision,
  formatNameList,
} from "@loadout/shared";
import {
  CircleAlert,
  CircleCheck,
  CircleMinus,
  CirclePlus,
  RefreshCw,
  SearchX,
} from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { ErrorState } from "@/components/ErrorState";
import { InlineNotice } from "@/components/InlineNotice";
import { StatusBadge, type StatusTone } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { useRunSkillsFile } from "@/features/projects/skills-file-mutations";
import { type SkillsFileMode, useSkillsFilePlan } from "@/features/projects/skills-file-queries";
import { useLastDefined } from "@/hooks/use-last-defined";

const ACTION_LOOK: Record<SkillsFileAction, { tone: StatusTone; icon: ReactNode }> = {
  add: { tone: "success", icon: <CirclePlus /> },
  update: { tone: "info", icon: <RefreshCw /> },
  same: { tone: "neutral", icon: <CircleCheck /> },
  edited: { tone: "warning", icon: <CircleAlert /> },
  remove: { tone: "danger", icon: <CircleMinus /> },
  keep_edited: { tone: "warning", icon: <CircleAlert /> },
};

/** Anything to write or remove, given whether hand-changed folders may be touched. */
function hasWork(plan: SkillsFilePlan, force: boolean): boolean {
  return plan.entries.some(
    (entry) =>
      entry.action === "add" ||
      entry.action === "update" ||
      entry.action === "remove" ||
      (force && (entry.action === "edited" || entry.action === "keep_edited")),
  );
}

function EntryRow({ entry }: { entry: SkillsFileEntry }): ReactNode {
  const { t } = useTranslation();
  const look = ACTION_LOOK[entry.action];
  return (
    <li className="flex items-center gap-3 rounded-md border bg-card px-3 py-2">
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">{entry.skill}</span>
        <span className="truncate font-mono text-xs text-muted-foreground" title={entry.folder}>
          {entry.folder}
        </span>
      </div>
      <StatusBadge
        tone={look.tone}
        icon={look.icon}
        label={t(`skillsFile.action.${entry.action}`)}
      />
    </li>
  );
}

function PlanBody({
  plan,
  mode,
  force,
  prune,
  onForce,
  onPrune,
}: {
  plan: SkillsFilePlan;
  mode: SkillsFileMode;
  force: boolean;
  prune: boolean;
  onForce: (value: boolean) => void;
  onPrune: (value: boolean) => void;
}): ReactNode {
  const { t } = useTranslation();
  const forceId = useId();
  const pruneId = useId();
  const edited = plan.entries.some((e) => e.action === "edited" || e.action === "keep_edited");
  const missing = plan.sources.flatMap((source) =>
    source.missing.map((name) => `${name} (${source.url})`),
  );
  return (
    <div className="flex flex-col gap-3">
      {plan.sources.length > 0 ? (
        <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
          {plan.sources.map((source) => (
            <li key={`${source.url}#${source.ref ?? ""}`} className="flex flex-wrap gap-x-2">
              <span className="font-mono text-foreground">{source.url}</span>
              {source.ref ? <span>{source.ref}</span> : null}
              <span className="font-mono">{formatRevision(source.revision)}</span>
              {source.moved ? <span>{t("skillsFile.newPin")}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {missing.length > 0 ? (
        <InlineNotice tone="warning" icon={SearchX}>
          {t("skillsFile.missing", { count: missing.length, names: formatNameList(missing) })}
        </InlineNotice>
      ) : null}
      {plan.unknownAgents.length > 0 ? (
        <InlineNotice tone="warning" icon={CircleAlert}>
          {t("skillsFile.unknownAgents", { names: formatNameList(plan.unknownAgents) })}
        </InlineNotice>
      ) : null}
      {plan.entries.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">{t("skillsFile.nothing")}</p>
      ) : (
        <ul className="-mr-2 flex max-h-[45vh] flex-col gap-1.5 overflow-y-auto pr-2">
          {plan.entries.map((entry) => (
            <EntryRow key={entry.folder} entry={entry} />
          ))}
        </ul>
      )}
      {mode === "apply" ? (
        <div className="flex items-start gap-2">
          <Checkbox
            id={pruneId}
            checked={prune}
            onCheckedChange={(v) => onPrune(v === true)}
            className="mt-0.5"
          />
          <Label htmlFor={pruneId} className="leading-5 font-normal">
            {t("skillsFile.prune")}
          </Label>
        </div>
      ) : null}
      {edited ? (
        <div className="flex items-start gap-2">
          <Checkbox
            id={forceId}
            checked={force}
            onCheckedChange={(v) => onForce(v === true)}
            className="mt-0.5"
          />
          <Label htmlFor={forceId} className="leading-5 font-normal">
            {t("skillsFile.force")}
          </Label>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Look before writing: fetch the sources, list what happens to every folder, then apply. Folders
 * changed by hand are kept unless the user ticks the box that replaces them.
 */
export function SkillsFilePlanDialog({
  dir,
  mode,
  onClose,
}: {
  dir: string;
  /** Null keeps the dialog closed. */
  mode: SkillsFileMode | null;
  onClose: () => void;
}): ReactNode {
  const { t } = useTranslation();
  const [force, setForce] = useState(false);
  const [prune, setPrune] = useState(false);
  const plan = useSkillsFilePlan(dir, mode ?? "apply", { prune }, mode !== null);
  const run = useRunSkillsFile();
  const close = (): void => {
    setForce(false);
    setPrune(false);
    onClose();
  };
  // Closing, it keeps showing what it was about while it fades out.
  const shown = useLastDefined(mode);
  const ready = plan.data && shown;

  return (
    <Dialog open={mode !== null} onOpenChange={(open) => !open && !run.isPending && close()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{shown ? t(`skillsFile.title.${shown}`) : null}</DialogTitle>
          <DialogDescription>
            {shown ? t(`skillsFile.description.${shown}`, { file: SKILLS_FILE_NAME }) : null}
          </DialogDescription>
        </DialogHeader>
        {plan.isPending ? (
          <p className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Spinner />
            {t("skillsFile.fetching")}
          </p>
        ) : plan.error ? (
          <ErrorState error={plan.error} onRetry={() => void plan.refetch()} />
        ) : ready ? (
          <PlanBody
            plan={plan.data}
            mode={shown}
            force={force}
            prune={prune}
            onForce={setForce}
            onPrune={setPrune}
          />
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={close} disabled={run.isPending}>
            {t("common.cancel")}
          </Button>
          <Button
            variant={shown === "unapply" ? "destructive" : "default"}
            disabled={
              !plan.data || plan.isPlaceholderData || !hasWork(plan.data, force) || run.isPending
            }
            onClick={() =>
              mode && run.mutate({ dir, mode, options: { force, prune } }, { onSuccess: close })
            }
          >
            {run.isPending || plan.isPlaceholderData ? <Spinner /> : null}
            {shown ? t(`skillsFile.confirm.${shown}`) : null}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
