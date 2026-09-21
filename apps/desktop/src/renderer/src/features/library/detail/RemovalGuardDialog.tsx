import type { AgentInfo, PendingRemoval } from "@loadout/shared";
import { FileX, Library } from "lucide-react";
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
import { useAgents } from "@/hooks/queries/agents";

/** `PendingRemoval.location` of files inside the library copy; anything else is an agent key. */
const LIBRARY_LOCATION = "library";

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
    const paths = groups.get(removal.location) ?? [];
    paths.push(removal.path);
    groups.set(removal.location, paths);
  }
  // The library first, then agents in the order the backend listed them.
  return [...groups.entries()].sort(
    ([a], [b]) => Number(b === LIBRARY_LOCATION) - Number(a === LIBRARY_LOCATION),
  );
}

/** Lists every file an update would delete, grouped by where it lives, before anything changes. */
export function RemovalGuardDialog({
  skillName,
  removals,
  busy,
  onApprove,
  onDecline,
}: RemovalGuardDialogProps): ReactNode {
  const { t } = useTranslation();
  const agents = useAgents();
  const groups = useMemo(() => groupByLocation(removals ?? []), [removals]);
  const agentOf = (key: string): AgentInfo | undefined =>
    agents.data?.find((agent) => agent.key === key);

  return (
    <AlertDialog
      open={removals !== null}
      onOpenChange={(open) => (open || busy ? undefined : onDecline())}
    >
      <AlertDialogContent className="sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("library.removalGuard.title", { name: skillName })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("library.removalGuard.description", { count: removals?.length ?? 0 })}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex max-h-72 flex-col gap-3 overflow-y-auto">
          {groups.map(([location, paths]) => {
            const agent = location === LIBRARY_LOCATION ? undefined : agentOf(location);
            return (
              <section key={location} className="flex flex-col gap-1.5">
                <h3 className="flex items-center gap-2 text-xs font-medium tracking-wider text-muted-foreground uppercase">
                  {location === LIBRARY_LOCATION ? (
                    <Library className="size-3.5" />
                  ) : (
                    <AgentAvatar
                      agentKey={location}
                      name={agent?.displayName ?? location}
                      size="sm"
                    />
                  )}
                  {location === LIBRARY_LOCATION
                    ? t("library.removalGuard.library")
                    : (agent?.displayName ?? location)}
                  <span className="tabular-nums opacity-70">{paths.length}</span>
                </h3>
                <ul
                  data-selectable
                  className="rounded-md border bg-muted/40 px-3 py-2 font-mono text-xs leading-5 break-all"
                >
                  {paths.map((path) => (
                    <li key={path}>{path}</li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>

        <InlineNotice tone="warning" icon={FileX}>
          {t("library.removalGuard.notice")}
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
