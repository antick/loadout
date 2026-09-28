import { type Skill, type SkillLocation, fixFrontmatter } from "@loadout/shared";
import { Info } from "lucide-react";
import { type ReactNode, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { DiffView } from "@/components/DiffView";
import { ErrorState } from "@/components/ErrorState";
import { InlineNotice } from "@/components/InlineNotice";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useSaveSkillFile } from "@/hooks/mutations/editor";
import { useEditorFile } from "@/hooks/queries/editor";
import { toastError, toastSuccess } from "@/lib/toast";

export interface FixFrontmatterDialogProps {
  skill: Skill;
  /** The skill's SKILL.md, relative to its folder. */
  path: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Shows exactly what adding the missing name and description would change in SKILL.md, and saves
 * it only on request. The save goes through the editor, so the replaced version is kept and a
 * change made on disk meanwhile is never overwritten.
 */
function FixFrontmatterBody({
  skill,
  path,
  onOpenChange,
}: Omit<FixFrontmatterDialogProps, "open">): ReactNode {
  const { t } = useTranslation();
  const location = useMemo<SkillLocation>(
    () => ({ kind: "library", skillId: skill.id }),
    [skill.id],
  );
  const file = useEditorFile(location, path);
  const save = useSaveSkillFile();
  const fix = useMemo(
    () => (file.data ? fixFrontmatter(file.data.content, skill.dirName) : null),
    [file.data, skill.dirName],
  );

  const apply = (): void => {
    if (!file.data || !fix) return;
    save.mutate(
      { location, input: { path, content: fix.content, baseHash: file.data.hash } },
      {
        onSuccess: () => {
          toastSuccess(t("checks.fixFrontmatter.done", { name: skill.name }));
          onOpenChange(false);
        },
        // A change made on disk meanwhile is refused; the file refetches and shows the new diff.
        onError: (error) => toastError(error, "checks.fixFrontmatter.failed"),
      },
    );
  };

  let preview: ReactNode;
  if (file.isPending) {
    preview = <Skeleton className="h-40 w-full" />;
  } else if (file.isError) {
    preview = <ErrorState error={file.error} onRetry={() => void file.refetch()} />;
  } else if (!fix) {
    preview = (
      <InlineNotice tone="info" icon={Info}>
        {t("checks.fixFrontmatter.nothing")}
      </InlineNotice>
    );
  } else {
    preview = (
      <div className="flex min-h-0 flex-col gap-3">
        <ul className="flex flex-col gap-1 text-sm">
          {fix.addedName === null ? null : (
            <li>{t("checks.fixFrontmatter.addsName", { name: fix.addedName })}</li>
          )}
          {fix.addedDescription === null ? null : (
            <li>{t("checks.fixFrontmatter.addsDescription")}</li>
          )}
        </ul>
        <DiffView before={file.data.content} after={fix.content} className="max-h-80" />
      </div>
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("checks.fixFrontmatter.title", { name: skill.name })}</DialogTitle>
        <DialogDescription>{t("checks.fixFrontmatter.description", { path })}</DialogDescription>
      </DialogHeader>
      {preview}
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          {t("common.cancel")}
        </Button>
        <Button onClick={apply} disabled={!fix || save.isPending}>
          {save.isPending ? <Spinner /> : null}
          {t("checks.fixFrontmatter.apply")}
        </Button>
      </DialogFooter>
    </>
  );
}

export function FixFrontmatterDialog({ open, ...props }: FixFrontmatterDialogProps): ReactNode {
  return (
    <Dialog open={open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        {open ? <FixFrontmatterBody {...props} /> : null}
      </DialogContent>
    </Dialog>
  );
}
