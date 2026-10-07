import type { PendingRemoval } from "@loadout/shared";
import { FileX, Library, PencilLine } from "lucide-react";
import { type ReactNode, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { AgentAvatar } from "@/components/AgentAvatar";
import { InlineNotice } from "@/components/InlineNotice";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useAgentNames } from "@/hooks/queries/agents";
import { SECTION_LABEL } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { REMOVAL_IN_LIBRARY } from "@loadout/shared";
import { PathList } from "@/components/PathList";

export interface RemovalGuardDialogProps {
  skillName: string;
  /** Null keeps the dialog closed. */
  removals: readonly PendingRemoval[] | null;
  busy: boolean;
  onApprove: () => void;
  onDecline: () => void;
}

function groupByLocation(removals: readonly PendingRemoval[]): [string, string[]][] {
  const groups = new Map<string, string[]>();
  for (const removal of removals) {
    if (removal.kind === "edited") continue;
    const paths = groups.get(removal.location) ?? [];
    paths.push(removal.path);
    groups.set(removal.location, paths);
  }
  // The library first, then agents in the order the backend listed them.
  return [...groups.entries()].sort(
    ([a], [b]) => Number(b === REMOVAL_IN_LIBRARY) - Number(a === REMOVAL_IN_LIBRARY),
  );
}

/**
 * Lists what an update would lose before anything changes: edits made in the app first, then
 * every file it would delete, grouped by where it lives.
 */
export function RemovalGuardDialog({
  skillName,
  removals,
  busy,
  onApprove,
  onDecline,
}: RemovalGuardDialogProps): ReactNode {
  const { t } = useTranslation();
  const names = useAgentNames();
  const groups = useMemo(() => groupByLocation(removals ?? []), [removals]);
  const edits = useMemo(
    () => (removals ?? []).filter((removal) => removal.kind === "edited").map((r) => r.path),
    [removals],
  );
  const deletions = (removals?.length ?? 0) - edits.length;

  return (
    <AlertDialog
      open={removals !== null}
      onOpenChange={(open) => (open || busy ? undefined : onDecline())}
    >
      <AlertDialogContent className="sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t(
              edits.length > 0 ? "library.removalGuard.titleEdits" : "library.removalGuard.title",
              {
                name: skillName,
              },
            )}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {edits.length > 0 && deletions === 0
              ? t("library.removalGuard.descriptionEdits", { count: edits.length })
              : t("library.removalGuard.description", { count: deletions })}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex max-h-72 flex-col gap-3 overflow-y-auto">
          {edits.length > 0 ? (
            <section className="flex flex-col gap-1.5">
              <h3 className={cn(SECTION_LABEL, "flex items-center gap-2")}>
                <PencilLine className="size-3.5" />
                {t("library.removalGuard.edits")}
                <span className="tabular-nums opacity-70">{edits.length}</span>
              </h3>
              <PathList paths={edits} tone="warning" />
            </section>
          ) : null}
          {groups.map(([location, paths]) => {
            const agentName = names.get(location) ?? location;
            return (
              <section key={location} className="flex flex-col gap-1.5">
                <h3 className={cn(SECTION_LABEL, "flex items-center gap-2")}>
                  {location === REMOVAL_IN_LIBRARY ? (
                    <Library className="size-3.5" />
                  ) : (
                    <AgentAvatar agentKey={location} name={agentName} size="sm" />
                  )}
                  {location === REMOVAL_IN_LIBRARY ? t("library.removalGuard.library") : agentName}
                  <span className="tabular-nums opacity-70">{paths.length}</span>
                </h3>
                <PathList paths={paths} />
              </section>
            );
          })}
        </div>

        <InlineNotice tone="warning" icon={FileX}>
          {t(edits.length > 0 ? "library.removalGuard.noticeEdits" : "library.removalGuard.notice")}
        </InlineNotice>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy} onClick={onDecline}>
            {t("library.removalGuard.keep")}
          </AlertDialogCancel>
          <Button variant="destructive" disabled={busy} onClick={onApprove}>
            {busy ? <Spinner /> : null}
            {t("library.removalGuard.approve")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
