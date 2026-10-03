import type { ConfirmOptions, GitPreview, InstallSelection, Skill } from "@loadout/shared";
import { useState } from "react";
import { useCancelPreview, useConfirmGit } from "@/hooks/mutations/install";

/** A fetched source waiting for the user to pick from it in `GitPreviewDialog`. */
export interface PreviewChoice {
  preview: GitPreview | null;
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
  return {
    preview,
    show: setPreview,
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
