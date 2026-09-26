import type { Project } from "@loadout/shared";
import { CircleAlert, CircleCheck } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { InlineNotice } from "@/components/InlineNotice";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { type AddScannedResult, useAddScannedProjects } from "@/hooks/mutations/add-project";
import { errorMessage } from "@/lib/toast";

/**
 * The pieces the Scan and Suggested tabs of "Link a project" share: a list of folders to tick,
 * the outcome of adding them, and the footer that adds the ticked ones.
 */

export interface ProjectPickItem {
  path: string;
  /** The row's body; the checkbox sits in front of it. */
  content: ReactNode;
}

export interface ProjectPickListProps {
  items: readonly ProjectPickItem[];
  picked: ReadonlySet<string>;
  onPickedChange: (picked: ReadonlySet<string>) => void;
  /** Line above the list, e.g. "12 projects found". */
  countLabel: string;
  /** Prefix for the checkbox ids, unique per tab. */
  idPrefix: string;
  className?: string;
}

/** Folders with a checkbox each, and a select-all toggle over the shown ones. */
export function ProjectPickList({
  items,
  picked,
  onPickedChange,
  countLabel,
  idPrefix,
  className,
}: ProjectPickListProps): ReactNode {
  const { t } = useTranslation();
  const allPicked = items.length > 0 && items.every((item) => picked.has(item.path));

  const toggle = (path: string): void => {
    const next = new Set(picked);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    onPickedChange(next);
  };
  const toggleAll = (): void => {
    const next = new Set(picked);
    for (const item of items) {
      if (allPicked) next.delete(item.path);
      else next.add(item.path);
    }
    onPickedChange(next);
  };

  return (
    <div className="flex min-h-0 flex-col gap-1.5">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{countLabel}</span>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          disabled={items.length === 0}
          onClick={toggleAll}
        >
          {allPicked ? t("selection.selectNone") : t("selection.selectAll")}
        </Button>
      </div>
      <ul className={className ?? "max-h-56 overflow-y-auto rounded-lg border"}>
        {items.map((item, index) => {
          const id = `${idPrefix}${index}`;
          return (
            <li key={item.path} className="border-b last:border-b-0">
              <Label
                htmlFor={id}
                className="flex cursor-pointer items-start gap-3 px-3 py-1.5 font-normal hover:bg-accent/40"
              >
                {/* Level with the first line of the row, however many lines follow. */}
                <Checkbox
                  id={id}
                  className="mt-0.5"
                  checked={picked.has(item.path)}
                  onCheckedChange={() => toggle(item.path)}
                />
                <div className="min-w-0 flex-1">{item.content}</div>
              </Label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** "2 added · 1 already linked · 0 failed", for the toast and the notice. */
export function useSummarizeAdded(): (result: AddScannedResult) => string {
  const { t } = useTranslation();
  return (result) =>
    [
      t("addProject.scan.added", { count: result.added.length }),
      t("addProject.scan.alreadyLinked", { count: result.alreadyLinked }),
      t("addProject.scan.failed", { count: result.failed.length }),
    ].join(" · ");
}

export interface AddPickedProjects {
  add: (paths: string[]) => void;
  outcome: AddScannedResult | null;
  pending: boolean;
  error: unknown;
  /** Forget the last outcome, e.g. when a new search starts. */
  reset: () => void;
}

/**
 * Link the ticked folders one by one. With nothing left to fix the dialog moves on; otherwise it
 * stays and shows what went wrong.
 */
export function useAddPickedProjects(
  onAdded: (projects: Project[], summary?: string) => void,
): AddPickedProjects {
  const addMany = useAddScannedProjects();
  const summarize = useSummarizeAdded();
  const [outcome, setOutcome] = useState<AddScannedResult | null>(null);
  return {
    add: (paths) =>
      addMany.mutate(paths, {
        onSuccess: (result) => {
          setOutcome(result);
          if (result.failed.length === 0 && result.added.length > 0) {
            onAdded(result.added, summarize(result));
          }
        },
      }),
    outcome,
    pending: addMany.isPending,
    error: addMany.error,
    reset: () => setOutcome(null),
  };
}

/** What adding the ticked folders did, and which failed and why. */
export function AddProjectsOutcome({
  outcome,
  error,
}: {
  outcome: AddScannedResult | null;
  error: unknown;
}): ReactNode {
  const summarize = useSummarizeAdded();
  return (
    <>
      {error ? (
        <InlineNotice tone="danger" icon={CircleAlert}>
          {errorMessage(error, "addProject.errors.add")}
        </InlineNotice>
      ) : null}
      {outcome ? (
        <InlineNotice
          tone={outcome.failed.length > 0 ? "warning" : "success"}
          icon={outcome.failed.length > 0 ? CircleAlert : CircleCheck}
        >
          <p>{summarize(outcome)}</p>
          {outcome.failed.length > 0 ? (
            <ul data-selectable className="mt-1 flex flex-col gap-0.5 text-xs break-all">
              {outcome.failed.map((failure) => (
                <li key={failure.name}>
                  <span className="font-mono">{failure.name}</span>: {failure.message}
                </li>
              ))}
            </ul>
          ) : null}
        </InlineNotice>
      ) : null}
    </>
  );
}

export interface AddProjectsFooterProps {
  outcome: AddScannedResult | null;
  pickedCount: number;
  pending: boolean;
  onSubmit: () => void;
  onCancel: () => void;
  onAdded: (projects: Project[], summary?: string) => void;
}

/** Cancel (or Close after a run), and "Add selected (n)". */
export function AddProjectsFooter({
  outcome,
  pickedCount,
  pending,
  onSubmit,
  onCancel,
  onAdded,
}: AddProjectsFooterProps): ReactNode {
  const { t } = useTranslation();
  return (
    <DialogFooter>
      <Button
        type="button"
        variant="ghost"
        // After a partly failed run, closing still opens what did get linked.
        onClick={() => (outcome && outcome.added.length > 0 ? onAdded(outcome.added) : onCancel())}
      >
        {t(outcome ? "addProject.close" : "common.cancel")}
      </Button>
      <Button type="button" disabled={pickedCount === 0 || pending} onClick={onSubmit}>
        {pending ? <Spinner /> : null}
        {t("addProject.scan.submit", { count: pickedCount })}
      </Button>
    </DialogFooter>
  );
}
