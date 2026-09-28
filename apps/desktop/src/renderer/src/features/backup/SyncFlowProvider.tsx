import type { SyncPreview, SyncReviewAnswer } from "@loadout/shared";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { usePreviewSync, useReviewedSync } from "@/hooks/mutations/backup-sync";
import { backupErrorText, needsReview, toastBackupError } from "@/lib/backup-errors";
import { type SyncFlow, type SyncFlowCallbacks, SyncFlowContext } from "./sync-flow";
import { SyncReviewDialog } from "./SyncReviewDialog";
import { useBackupStage } from "./use-backup-stage";

/** Only changes coming in, or a merge that cannot be listed, are worth a look first. */
function worthReviewing(preview: SyncPreview): boolean {
  if (!preview.remoteCommit) return false;
  if (!preview.perSkill) return preview.remoteBackups > 0;
  return preview.incoming.length > 0 || preview.conflicts.length > 0;
}

/** Owns the sync review dialog; see `SyncFlow`. */
export function SyncFlowProvider({ children }: { children: ReactNode }): ReactNode {
  const { t } = useTranslation();
  const preview = usePreviewSync();
  const sync = useReviewedSync();
  const stage = useBackupStage();
  const [review, setReview] = useState<SyncPreview | null>(null);
  // The caller of the flow in progress, told how it ended.
  const callbacks = useRef<SyncFlowCallbacks>({});
  const { mutate: runPreview } = preview;
  const { mutate: runSync } = sync;

  const fail = useCallback(
    (error: unknown) => {
      setReview(null);
      toastBackupError(error, t);
      callbacks.current.onError?.(error);
    },
    [t],
  );

  // `send` looks again when the sync asks for a review, and `look` sends: a ref breaks the loop.
  const lookRef = useRef<() => void>(() => undefined);

  const send = useCallback(
    (answer: SyncReviewAnswer | undefined): void => {
      runSync(answer, {
        onSuccess: (outcome) => {
          setReview(null);
          callbacks.current.onSuccess?.(outcome);
        },
        onError: (error) => {
          // The remote moved on, or it would delete many skills: show the review (again).
          if (needsReview(error)) {
            toast.info(backupErrorText(error, t));
            lookRef.current();
          } else fail(error);
        },
      });
    },
    [runSync, fail, t],
  );

  const look = useCallback((): void => {
    runPreview(undefined, {
      onSuccess: (next) => {
        if (worthReviewing(next)) setReview(next);
        // Nothing coming in: only this computer's own changes go out.
        else send(undefined);
      },
      onError: fail,
    });
  }, [runPreview, send, fail]);

  useEffect(() => {
    lookRef.current = look;
  }, [look]);

  const flow = useMemo<SyncFlow>(
    () => ({
      start: (next = {}) => {
        callbacks.current = next;
        look();
      },
      busy: preview.isPending || sync.isPending,
    }),
    [look, preview.isPending, sync.isPending],
  );

  return (
    <SyncFlowContext.Provider value={flow}>
      {children}
      <SyncReviewDialog
        preview={review}
        syncing={sync.isPending || preview.isPending}
        stage={stage}
        onCancel={() => setReview(null)}
        onSync={send}
      />
    </SyncFlowContext.Provider>
  );
}
