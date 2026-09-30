import {
  type ConfirmOptions,
  type GitPreview,
  type InstallSelection,
  type SkillSource,
  planInstallNames,
} from "@loadout/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  useCancelPreview,
  useConfirmGit,
  usePreviewArchive,
  usePreviewGit,
} from "@/hooks/mutations/install";

export interface BrowseSource {
  /** The source being fetched, so its button can show a spinner. */
  busyKey: string | null;
  /** Open for choosing; hand it to `GitPreviewDialog`. */
  preview: GitPreview | null;
  /** `tick`: names to tick when the list opens (the source's new skills); else the usual ones. */
  browse(source: SkillSource, tick?: readonly string[]): Promise<void>;
  dismiss(preview: GitPreview): void;
  confirm(preview: GitPreview, items: InstallSelection[], options: ConfirmOptions): void;
}

/**
 * Fetch a source again and offer what it has now. When everything in it is already in the
 * library there is nothing to choose, so a toast says so instead of an empty choice.
 */
export function useBrowseSource(): BrowseSource {
  const { t } = useTranslation();
  const previewGit = usePreviewGit();
  const previewArchive = usePreviewArchive();
  const confirmGit = useConfirmGit();
  const cancelPreview = useCancelPreview();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [preview, setPreview] = useState<GitPreview | null>(null);

  const browse = async (source: SkillSource, tick?: readonly string[]): Promise<void> => {
    if (busyKey || !source.browse) return;
    setBusyKey(source.key);
    try {
      const { kind, target } = source.browse;
      const result =
        kind === "git"
          ? await previewGit(target)
          : await previewArchive.mutateAsync(target).catch(() => null);
      if (!result) return;
      if (tick) {
        const wanted = new Set(tick);
        const selected = result.skills.filter((skill) => wanted.has(skill.name));
        setPreview({ ...result, selected: selected.map((skill) => skill.relPath) });
        return;
      }
      const outcomes = planInstallNames(
        result.skills.map((skill) => skill.name),
        result.library,
      );
      // A skill whose name another source holds is still new from this one.
      if (outcomes.every((outcome) => outcome.kind === "installed")) {
        cancelPreview.mutate(result.previewId);
        toast.info(t("sources.nothingNew", { source: source.label, count: result.skills.length }));
        return;
      }
      setPreview(result);
    } finally {
      setBusyKey(null);
    }
  };

  return {
    busyKey,
    preview,
    browse,
    dismiss: (dismissed) => {
      cancelPreview.mutate(dismissed.previewId);
      setPreview(null);
    },
    confirm: (confirmed, items, options) => {
      // Confirming spends the checkout whether or not it works, so the dialog closes at once.
      setPreview(null);
      void confirmGit(confirmed, items, options);
    },
  };
}
