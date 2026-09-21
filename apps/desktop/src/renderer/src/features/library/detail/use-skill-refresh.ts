import type { InstallProgress, PendingRemoval, Skill } from "@loadout/shared";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  type SkillRefreshRequest,
  updateProgressKey,
  useCancelInstall,
  useRefreshSkill,
} from "@/hooks/mutations/library";
import { useAppEvent } from "@/lib/events";
import { toastSuccess } from "@/lib/toast";

/** An update that stopped because it would delete files; waiting for the user's decision. */
export interface PendingApproval {
  request: SkillRefreshRequest;
  removals: PendingRemoval[];
  approval: string | null;
}

export interface SkillRefresh {
  /** Update from upstream, re-import from the source folder, or relink to a new folder. */
  start(request: SkillRefreshRequest): void;
  running: boolean;
  /** Which request is running, so the right button can show the spinner. */
  runningKind: SkillRefreshRequest["kind"] | null;
  progress: InstallProgress | null;
  cancel(): void;
  pending: PendingApproval | null;
  /** Go ahead although files will be removed. A stale token brings the dialog back with the new list. */
  approve(): void;
  decline(): void;
}

/**
 * Runs update / re-import / relink for one skill, with the removal guard: when the answer lists
 * files that would be deleted nothing has changed yet, and the list waits in `pending`.
 */
export function useSkillRefresh(skill: Skill): SkillRefresh {
  const { t } = useTranslation();
  const refresh = useRefreshSkill();
  const cancelInstall = useCancelInstall();
  const [pending, setPending] = useState<PendingApproval | null>(null);
  const [progress, setProgress] = useState<InstallProgress | null>(null);
  const [runningKind, setRunningKind] = useState<SkillRefreshRequest["kind"] | null>(null);
  const progressKey = updateProgressKey(skill.id);
  const { mutate } = refresh;

  useAppEvent("install:progress", (event) => {
    if (event.key === progressKey) setProgress(event);
  });

  const run = useCallback(
    (request: SkillRefreshRequest, approval: string | null) => {
      setRunningKind(request.kind);
      mutate(
        { skillId: skill.id, request, approval },
        {
          onSuccess: (result) => {
            if (result.pendingRemovals.length > 0) {
              setPending({ request, removals: result.pendingRemovals, approval: result.approval });
              return;
            }
            setPending(null);
            toastSuccess(
              t(result.contentChanged ? "library.refresh.done" : "library.refresh.unchanged", {
                name: result.skill.name,
              }),
            );
          },
          onSettled: () => {
            setProgress(null);
            setRunningKind(null);
          },
        },
      );
    },
    [mutate, skill.id, t],
  );

  return {
    start: (request) => run(request, null),
    running: refresh.isPending,
    runningKind: refresh.isPending ? runningKind : null,
    progress: refresh.isPending ? progress : null,
    cancel: () => cancelInstall.mutate(progressKey),
    pending,
    approve: () => {
      if (!pending) return;
      // Close the dialog so progress and Cancel are reachable; a stale token brings it back.
      setPending(null);
      run(pending.request, pending.approval);
    },
    decline: () => setPending(null),
  };
}
