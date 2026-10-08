import { MARKETPLACE_NAME, type Skill, type SourceCandidate } from "@loadout/shared";
import { useNavigate } from "@tanstack/react-router";
import { Check, UserPen } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { StatusBadge } from "@/components/StatusBadge";
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
import { Spinner } from "@/components/ui/spinner";
import { useAttachSource, useSetAuthored } from "@/features/origin/origin-mutations";
import { errorMessage } from "@/lib/toast";
import { SourceCandidateItem } from "./SourceCandidateItem";
import { isExact } from "./source-candidate";
import { type SearchRow, type SourceSearches, useSourceSearches } from "./use-source-searches";

export interface FindSourcesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Skills to look for; taken once when the dialog opens. */
  skills: readonly Skill[];
}

/** The best candidate of a finished search, if any. */
function bestOf(row: SearchRow | undefined): SourceCandidate | undefined {
  return row?.state === "done" ? row.search.candidates[0] : undefined;
}

/**
 * Look for the source of every skill that has none, then link the ticked ones in one go. Exact
 * matches come ticked; a changed copy waits for the user to tick it.
 */
export function FindSourcesDialog({ open, onOpenChange, skills }: FindSourcesDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="min-w-0 sm:max-w-2xl">
        {/* Mounted afresh on every opening; kept whole while it fades out. */}
        <FindSourcesBody skills={skills} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

/** Mounted per opening, so every opening searches afresh. */
function FindSourcesBody({
  skills,
  onClose,
}: {
  skills: readonly Skill[];
  onClose: () => void;
}): ReactNode {
  const { t } = useTranslation();
  const [listed] = useState(skills);
  const searches = useSourceSearches(listed);
  const attach = useAttachSource();
  const [linking, setLinking] = useState(false);
  /** The user's own ticks; untouched rows follow "exact match comes ticked". */
  const [choices, setChoices] = useState<ReadonlyMap<string, boolean>>(new Map());

  const isTicked = (skillId: string): boolean => {
    const row = searches.rows.get(skillId);
    if (!bestOf(row)) return false;
    return choices.get(skillId) ?? isExact(bestOf(row));
  };
  const ticked = listed.filter((skill) => isTicked(skill.id));
  const differs = ticked.some((skill) => !isExact(bestOf(searches.rows.get(skill.id))));

  const linkTicked = async (): Promise<void> => {
    setLinking(true);
    let linked = 0;
    for (const skill of ticked) {
      const candidate = bestOf(searches.rows.get(skill.id));
      if (!candidate) continue;
      try {
        await attach.mutateAsync({ skillId: skill.id, candidate, announce: false });
        searches.set(skill.id, { state: "linked" });
        linked += 1;
      } catch (error) {
        searches.set(skill.id, { state: "failed", message: errorMessage(error) });
      }
    }
    setLinking(false);
    if (linked > 0) toast.success(t("origin.batch.linkedToast", { count: linked }));
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("origin.batch.title")}</DialogTitle>
        <DialogDescription>
          {t("origin.batch.description", { marketplace: MARKETPLACE_NAME })}
        </DialogDescription>
      </DialogHeader>

      {listed.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("origin.batch.empty")}</p>
      ) : (
        <ul className="-mx-1 flex max-h-[55vh] flex-col divide-y overflow-y-auto rounded-md border">
          {listed.map((skill) => (
            <SearchResultRow
              key={skill.id}
              skill={skill}
              searches={searches}
              ticked={isTicked(skill.id)}
              disabled={linking}
              onTick={(on) => setChoices((previous) => new Map(previous).set(skill.id, on))}
              onClose={onClose}
            />
          ))}
        </ul>
      )}

      {differs ? (
        <p className="text-xs text-muted-foreground">{t("origin.batch.differNote")}</p>
      ) : null}

      <DialogFooter className="items-center sm:justify-between">
        <p aria-live="polite" className="text-xs text-muted-foreground">
          {searches.running
            ? t("origin.batch.progress", { done: searches.done, total: listed.length })
            : t("origin.batch.done", { count: listed.length })}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose}>
            {t("common.close")}
          </Button>
          <Button disabled={linking || ticked.length === 0} onClick={() => void linkTicked()}>
            {linking ? <Spinner /> : null}
            {t("origin.batch.linkSelected", { count: ticked.length })}
          </Button>
        </div>
      </DialogFooter>
    </>
  );
}

function SearchResultRow({
  skill,
  searches,
  ticked,
  disabled,
  onTick,
  onClose,
}: {
  skill: Skill;
  searches: SourceSearches;
  ticked: boolean;
  disabled: boolean;
  onTick: (on: boolean) => void;
  onClose: () => void;
}): ReactNode {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setAuthored = useSetAuthored();
  const row = searches.rows.get(skill.id);
  const best = bestOf(row);
  const others = row?.state === "done" ? row.search.candidates.length - 1 : 0;
  const settled = row?.state === "linked" || row?.state === "marked";

  const markMine = async (): Promise<void> => {
    // A failure is toasted by the mutation, and the row stays as it was.
    const marked = await setAuthored
      .mutateAsync({ skillId: skill.id, authored: true, quiet: true })
      .then(
        () => true,
        () => false,
      );
    if (marked) searches.set(skill.id, { state: "marked" });
  };

  const openSkill = (): void => {
    onClose();
    void navigate({ to: "/library", search: { skill: skill.id } });
  };

  return (
    <li className="flex items-start gap-3 px-3 py-2.5">
      <Checkbox
        className="mt-0.5"
        aria-label={skill.name}
        checked={ticked}
        disabled={disabled || !best || settled}
        onCheckedChange={(state) => onTick(state === true)}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <button
          type="button"
          className="w-fit truncate text-left text-sm font-medium hover:underline"
          onClick={openSkill}
        >
          {skill.name}
        </button>
        <RowStatus row={row} best={best} others={others} />
      </div>
      {settled || row?.state === "searching" || row?.state === "waiting" ? null : (
        <Button
          variant="ghost"
          size="xs"
          title={t("origin.mineHint")}
          disabled={disabled || setAuthored.isPending}
          onClick={() => void markMine()}
        >
          <UserPen />
          {t("origin.mine")}
        </Button>
      )}
    </li>
  );
}

function RowStatus({
  row,
  best,
  others,
}: {
  row: SearchRow | undefined;
  best: SourceCandidate | undefined;
  others: number;
}): ReactNode {
  const { t } = useTranslation();
  const muted = "text-xs text-muted-foreground";
  switch (row?.state) {
    case undefined:
    case "waiting":
    case "searching":
      return (
        <span className={`flex items-center gap-1.5 ${muted}`}>
          {row?.state === "searching" ? <Spinner className="size-3" /> : null}
          {t("origin.batch.searching")}
        </span>
      );
    case "failed":
      return (
        <span data-selectable className="text-xs break-words text-danger">
          {row.message}
        </span>
      );
    case "linked":
      return (
        <StatusBadge
          tone="success"
          icon={<Check />}
          label={t("origin.batch.linkedRow")}
          className="self-start"
        />
      );
    case "marked":
      return (
        <StatusBadge
          tone="neutral"
          icon={<UserPen />}
          label={t("origin.batch.marked")}
          className="self-start"
        />
      );
    case "done":
      if (!best) return <span className={muted}>{t("origin.batch.none")}</span>;
      return (
        <div className="flex flex-col gap-1">
          <SourceCandidateItem candidate={best} compact />
          {others > 0 ? (
            <span className={muted}>{t("origin.batch.otherMatches", { count: others })}</span>
          ) : null}
        </div>
      );
  }
}
