import type { ConfirmOptions, GitPreview, InstallSelection, Skill } from "@loadout/shared";
import { useState } from "react";
import {
  useCancelPreview,
  useCancelPreviewOnLeave,
  useConfirmGit,
} from "@/features/install/install-mutations";
import { useMounted } from "@/hooks/use-mounted";

/** A fetched source waiting for the user to pick from it in `GitPreviewDialog`. */
export interface PreviewChoice {
  preview: GitPreview | null;
  /** Offer it; one that arrives after the page was left is thrown away at once. */
  show(preview: GitPreview): void;
  /** Give the preview up; its checkout is thrown away. */
  dismiss(preview: GitPreview): void;
  /** Install what was picked; null when it did not install. */
  confirm(
    preview: GitPreview,
    items: InstallSelection[],
    options?: ConfirmOptions,
  ): Promise<Skill[] | null>;
}

export function usePreviewChoice(): PreviewChoice {
  const confirmGit = useConfirmGit();
  const cancelPreview = useCancelPreview();
  const [preview, setPreview] = useState<GitPreview | null>(null);
  const mounted = useMounted();
  useCancelPreviewOnLeave(preview);
  return {
    preview,
    show: (shown) => {
      // Leaving already cancelled what was open: nobody is left to choose from this one.
      if (mounted.current) setPreview(shown);
      else cancelPreview.mutate(shown.previewId);
    },
    dismiss: (dismissed) => {
      cancelPreview.mutate(dismissed.previewId);
      setPreview(null);
    },
    confirm: (confirmed, items, options) => {
      // Confirming spends the checkout whether or not it works, so the dialog closes at once.
      setPreview(null);
      return confirmGit(confirmed, items, options);
    },
  };
}
