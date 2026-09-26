import { type ActivityKind, formatRelative } from "@loadout/shared";
import {
  Activity,
  ArrowUpCircle,
  CloudUpload,
  FileArchive,
  FilePlus2,
  FolderInput,
  History,
  Layers,
  type LucideIcon,
  PackagePlus,
  ShieldCheck,
  Pencil,
  Plug,
  Trash2,
  Unplug,
} from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { PageSection } from "@/components/PageSection";
import { StatusBadge } from "@/components/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { useActivity } from "@/hooks/queries/dashboard";
import { cn } from "@/lib/utils";
import { ACTIVITY_LIMIT } from "./constants";

const KIND_ICONS: Record<ActivityKind, LucideIcon> = {
  install: PackagePlus,
  create: FilePlus2,
  scan: ShieldCheck,
  remove: Trash2,
  edit: Pencil,
  update: ArrowUpCircle,
  deploy: Plug,
  undeploy: Unplug,
  import: FolderInput,
  export: FileArchive,
  backup: CloudUpload,
  restore: History,
  preset: Layers,
};
const SKELETON_ROWS = 5;

/** What the app did lately, newest first, with failures marked. */
export function RecentActivity(): ReactNode {
  const { t } = useTranslation();
  const activity = useActivity(ACTIVITY_LIMIT);

  let body: ReactNode;
  if (activity.isPending) {
    body = (
      <div className="flex flex-col gap-2 p-3">
        {Array.from({ length: SKELETON_ROWS }, (_, index) => (
          <Skeleton key={index} className="h-9 w-full" />
        ))}
      </div>
    );
  } else if (activity.isError) {
    body = <ErrorState error={activity.error} onRetry={() => void activity.refetch()} />;
  } else if (activity.data.length === 0) {
    body = (
      <EmptyState
        icon={Activity}
        title={t("dashboard.activity.emptyTitle")}
        description={t("dashboard.activity.emptyBody")}
      />
    );
  } else {
    body = (
      <ul className="flex flex-col divide-y">
        {activity.data.map((entry) => {
          const Icon = KIND_ICONS[entry.kind] ?? Activity;
          return (
            <li key={entry.id} className="flex items-center gap-3 px-4 py-2">
              <span
                className={cn(
                  "inline-flex size-7 shrink-0 items-center justify-center rounded-md",
                  entry.ok ? "bg-muted text-muted-foreground" : "bg-danger/15 text-danger",
                )}
              >
                <Icon className="size-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">
                    {t(`dashboard.activity.kind.${entry.kind}`)}
                  </span>
                  <span className="truncate font-medium">{entry.subject}</span>
                  {entry.ok ? null : (
                    <StatusBadge tone="danger" label={t("dashboard.activity.failed")} />
                  )}
                </p>
                {entry.detail ? (
                  <p
                    data-selectable
                    className="truncate text-xs text-muted-foreground"
                    title={entry.detail}
                  >
                    {entry.detail}
                  </p>
                ) : null}
              </div>
              <time className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {formatRelative(entry.at)}
              </time>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <PageSection title={t("dashboard.activity.title")}>
      <div className="overflow-hidden rounded-lg border bg-card">{body}</div>
    </PageSection>
  );
}
