import type { Project } from "@loadout/shared";
import { FolderGit2, FolderSymlink } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { PathText } from "@/components/PathText";
import { StatusBadge } from "@/components/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";

export interface ProjectHeaderProps {
  project: Project;
  /** Logical skills switched on / in total. Undefined while loading; null when there is nothing to count. */
  counts: { enabled: number; total: number } | null | undefined;
}

/** Where the workspace lives, what kind it is, and how many of its skills are switched on. */
export function ProjectHeader({ project, counts }: ProjectHeaderProps): ReactNode {
  const { t } = useTranslation();
  const linked = project.type === "linked";
  const Icon = linked ? FolderSymlink : FolderGit2;
  return (
    <header className="flex items-center gap-4">
      <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="size-5" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <PathText path={project.path} reveal={!project.missing} />
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground tabular-nums">
          {counts === undefined ? <Skeleton className="h-4 w-28" /> : null}
          {counts ? <span>{t("projectPage.enabledOf", counts)}</span> : null}
          {linked ? (
            <StatusBadge
              tone="brass"
              icon={<FolderSymlink />}
              label={t("projectPage.linkedBadge")}
            />
          ) : null}
        </div>
      </div>
    </header>
  );
}
