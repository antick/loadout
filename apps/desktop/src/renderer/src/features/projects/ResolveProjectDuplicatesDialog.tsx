import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ErrorState } from "@/components/ErrorState";
import { PathText } from "@/components/PathText";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { api } from "@/lib/api";
import { keys } from "@/lib/query-keys";
import { DIALOG_TALL_CLASS } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { ProjectDuplicateComparison } from "./ProjectDuplicateComparison";

interface Props {
  projectId: string;
  skill: string;
  name: string;
  onClose(): void;
}

function ResolutionBody({ projectId, skill, name, onClose }: Props) {
  const { t } = useTranslation();
  const queryKey = keys.projects.duplicatePlan(projectId, skill);
  const query = useQuery({
    queryKey,
    queryFn: () => api.projects.previewDuplicates(projectId, skill),
    refetchOnMount: "always",
  });
  const resolve = useApiMutation({
    fn: (token: string) => api.projects.resolveDuplicates(projectId, skill, token),
    error: false,
    invalidate: [queryKey],
  });
  const undo = useApiMutation({
    fn: () => api.projects.undoDuplicates(projectId, skill),
    error: false,
    invalidate: [queryKey],
    success: () => t("projectDuplicates.undone"),
  });
  const plan = query.data;
  const pending = resolve.isPending || undo.isPending;
  const error = query.error ?? resolve.error ?? undo.error;
  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("projectDuplicates.title", { name })}</DialogTitle>
        <DialogDescription>{t("projectDuplicates.description")}</DialogDescription>
      </DialogHeader>
      {query.isPending ? <Spinner /> : null}
      {error ? (
        <ErrorState
          error={error}
          onRetry={() => {
            resolve.reset();
            undo.reset();
            void query.refetch();
          }}
        />
      ) : null}
      {plan ? (
        <div className="flex min-w-0 flex-col gap-4">
          <output className="text-sm">{t(`projectDuplicates.status.${plan.status}`)}</output>
          {plan.reason ? (
            <p className="break-words text-sm text-muted-foreground">{plan.reason}</p>
          ) : null}
          {plan.canonicalPath && ["identical", "resolved"].includes(plan.status) ? (
            <div className="min-w-0 rounded-lg border p-3">
              <p className="mb-1 text-sm font-medium">{t("projectDuplicates.keep")}</p>
              <PathText path={plan.canonicalPath} wrap />
            </div>
          ) : null}
          {plan.status === "identical" ? (
            <>
              <p className="text-sm font-medium">{t("projectDuplicates.replace")}</p>
              <ul className="flex flex-col gap-2">
                {plan.copies
                  .filter((copy) => copy.path !== plan.canonicalPath)
                  .map((copy) => (
                    <li key={copy.path} className="min-w-0 rounded-lg border p-3">
                      <PathText path={copy.path} wrap />
                    </li>
                  ))}
              </ul>
              <p className="text-sm text-muted-foreground">{t("projectDuplicates.effect")}</p>
              <p className="text-xs text-muted-foreground">{t("projectDuplicates.backups")}</p>
            </>
          ) : null}
          {plan.links.length > 0 ? (
            <div className="min-w-0 space-y-2">
              <p className="text-sm font-medium">{t("projectDuplicates.existingLinks")}</p>
              <p className="text-sm text-muted-foreground">
                {t("projectDuplicates.existingLinksHelp")}
              </p>
              <ul className="flex flex-col gap-2">
                {plan.links.map((link) => (
                  <li key={link.path} className="min-w-0 rounded-lg border p-3">
                    <PathText path={link.path} wrap />
                    <p className="my-1 text-xs text-muted-foreground">
                      {t("projectDuplicates.pointsTo")}
                    </p>
                    <PathText path={link.targetPath} wrap />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {plan.status === "different" ? (
            <ProjectDuplicateComparison plan={plan} projectId={projectId} skill={skill} />
          ) : null}
          <p className="text-xs text-muted-foreground">{t("projectDuplicates.global")}</p>
        </div>
      ) : null}
      <DialogFooter>
        <Button variant="ghost" disabled={pending} onClick={onClose}>
          {t(plan?.status === "resolved" ? "common.close" : "common.cancel")}
        </Button>
        {plan?.canUndo ? (
          <Button disabled={pending} onClick={() => undo.mutate()}>
            {pending ? <Spinner /> : null}
            {t("projectDuplicates.undo")}
          </Button>
        ) : plan?.status === "identical" ? (
          <Button disabled={pending || query.isFetching} onClick={() => resolve.mutate(plan.token)}>
            {pending ? <Spinner /> : null}
            {t("projectDuplicates.action")}
          </Button>
        ) : null}
      </DialogFooter>
    </>
  );
}

export function ResolveProjectDuplicatesDialog(props: Props & { open: boolean }) {
  return (
    <Dialog open={props.open} onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent className={cn(DIALOG_TALL_CLASS, "overflow-y-auto sm:max-w-2xl")}>
        {props.open ? <ResolutionBody {...props} /> : null}
      </DialogContent>
    </Dialog>
  );
}
