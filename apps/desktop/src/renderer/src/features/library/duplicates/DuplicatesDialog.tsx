import type { Skill } from "@loadout/shared";
import { CopyCheck, TextSearch } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useDismissDuplicate } from "@/features/library/duplicates/duplicate-mutations";
import { useDuplicates } from "@/features/library/duplicates/duplicate-queries";
import { DuplicatePairCard } from "@/features/library/duplicates/DuplicatePairCard";
import { useMergeDuplicate } from "@/features/library/duplicates/use-merge-duplicate";
import { useSkills } from "@/hooks/queries/skills";

export interface DuplicatesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Pairs of library skills that may be one: compare them, keep one, or say they differ. Same files
 * and alike names are listed at once; comparing every skill's text waits until the person asks.
 */
export function DuplicatesDialog({ open, onOpenChange }: DuplicatesDialogProps): ReactNode {
  const { t } = useTranslation();
  const [showDismissed, setShowDismissed] = useState(false);
  const [similarText, setSimilarText] = useState(false);
  const duplicates = useDuplicates({ includeDismissed: showDismissed, similarText });
  const skills = useSkills();
  const dismiss = useDismissDuplicate();
  const merge = useMergeDuplicate();
  const byId = useMemo(
    () => new Map<string, Skill>((skills.data ?? []).map((skill) => [skill.id, skill])),
    [skills.data],
  );
  const pairs = duplicates.data?.pairs ?? [];
  const dismissedCount = duplicates.data?.dismissedCount ?? 0;
  const textCompared = duplicates.data?.similarText === true;
  const comparing = similarText && duplicates.isFetching;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // The slow look is asked for each time, never carried into the next opening.
        if (!next) setSimilarText(false);
        onOpenChange(next);
      }}
    >
      <DialogContent
        className="flex max-h-[85vh] flex-col gap-4 sm:max-w-3xl"
        onInteractOutside={(event) => {
          // Undo on the toast of a merge must not close the list it came from.
          if (event.target instanceof Element && event.target.closest("[data-sonner-toast]")) {
            event.preventDefault();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{t("duplicates.title")}</DialogTitle>
          <DialogDescription>{t("duplicates.description")}</DialogDescription>
        </DialogHeader>
        {dismissedCount > 0 || showDismissed ? (
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={showDismissed}
              onCheckedChange={(checked) => setShowDismissed(checked === true)}
            />
            {t("duplicates.showDismissed", { count: dismissedCount })}
          </label>
        ) : null}
        {duplicates.isSuccess && !textCompared ? (
          <div className="flex flex-wrap items-center gap-2">
            <p className="min-w-0 flex-1 text-sm text-muted-foreground">
              {t("duplicates.similarTextHint")}
            </p>
            <Button
              variant="outline"
              size="sm"
              disabled={comparing}
              onClick={() => setSimilarText(true)}
            >
              {comparing ? <Spinner /> : <TextSearch />}
              {comparing ? t("duplicates.comparing") : t("duplicates.similarText")}
            </Button>
          </div>
        ) : null}
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
          {duplicates.isPending || skills.isPending ? (
            <Skeleton className="h-40 w-full" />
          ) : duplicates.isError ? (
            <ErrorState error={duplicates.error} onRetry={() => void duplicates.refetch()} />
          ) : pairs.length === 0 ? (
            <EmptyState
              icon={CopyCheck}
              title={t("duplicates.empty.title")}
              description={t(
                textCompared ? "duplicates.empty.description" : "duplicates.empty.descriptionQuick",
              )}
            />
          ) : (
            pairs.map((pair) => {
              const a = byId.get(pair.a);
              const b = byId.get(pair.b);
              if (!a || !b) return null;
              return (
                <DuplicatePairCard
                  key={pair.key}
                  pair={pair}
                  a={a}
                  b={b}
                  busy={merge.busy || dismiss.isPending}
                  onKeep={(keep, remove) => void merge.run(keep, remove)}
                  onDismiss={(target, dismissed) =>
                    dismiss.mutate({ idA: target.a, idB: target.b, dismissed })
                  }
                />
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
