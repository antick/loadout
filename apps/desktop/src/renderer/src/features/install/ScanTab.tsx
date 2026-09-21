import type { BatchImportResult, DiscoveredSkill } from "@loadout/shared";
import { Bot, Check, Clock, FolderSearch, Info, PackagePlus, Radar, RotateCw } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { PageSection } from "@/components/PageSection";
import { StatCard } from "@/components/StatCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { BatchResultSummary } from "@/features/install/BatchResultSummary";
import { SCAN_SKELETON_COUNT, SCAN_STAT_COUNT } from "@/features/install/constants";
import { DiscoveredSkillRow } from "@/features/install/DiscoveredSkillRow";
import { useInstallTask } from "@/features/install/use-install-task";
import {
  IMPORT_ALL_DISCOVERED_KEY,
  discoveredTaskKey,
  useImportAllDiscovered,
  useImportDiscovered,
} from "@/hooks/mutations/install";
import { useAgents } from "@/hooks/queries/agents";
import { useScanLocal } from "@/hooks/queries/install";

const STATS_GRID_CLASS = "grid grid-cols-2 gap-3 lg:grid-cols-4";

/** Stable identity of a discovered group across rescans. */
function groupKey(skill: DiscoveredSkill): string {
  return `${skill.name}::${skill.fingerprint}`;
}

function ScanSkeleton(): ReactNode {
  return (
    <div className="flex flex-col gap-6" aria-hidden="true">
      <div className={STATS_GRID_CLASS}>
        {Array.from({ length: SCAN_STAT_COUNT }, (_, index) => (
          <Skeleton key={index} className="h-20 rounded-lg" />
        ))}
      </div>
      <div className="divide-y rounded-lg border bg-card">
        {Array.from({ length: SCAN_SKELETON_COUNT }, (_, index) => (
          <div key={index} className="flex items-center gap-4 px-4 py-3">
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-80 max-w-full" />
            </div>
            <Skeleton className="h-8 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Find skills already sitting in agent folders and copy them into the library. */
export function ScanTab(): ReactNode {
  const { t } = useTranslation();
  const scan = useScanLocal();
  const agents = useAgents();
  const importOne = useImportDiscovered();
  const importAll = useImportAllDiscovered();
  const { task } = useInstallTask();
  const [names, setNames] = useState<Record<string, string>>({});
  const [batch, setBatch] = useState<BatchImportResult | null>(null);

  const agentsByKey = useMemo(
    () => new Map((agents.data ?? []).map((agent) => [agent.key, agent])),
    [agents.data],
  );
  const groups = scan.data?.skills ?? [];
  const pending = groups.filter((skill) => !skill.imported);
  const imported = groups.filter((skill) => skill.imported);
  const importingAll = Boolean(task(IMPORT_ALL_DISCOVERED_KEY));

  const runImportAll = async (): Promise<void> => {
    setBatch(null);
    const result = await importAll();
    // Only worth a panel when something needs reading; a clean run is covered by the toast.
    if (result && result.errors.length > 0) setBatch(result);
  };

  if (scan.isPending) return <ScanSkeleton />;
  if (scan.isError) {
    return (
      <ErrorState
        error={scan.error}
        title={t("install.scan.loadFailed")}
        onRetry={() => void scan.refetch()}
      />
    );
  }

  const renderRows = (skills: readonly DiscoveredSkill[]): ReactNode => (
    <ul className="divide-y rounded-lg border bg-card">
      {skills.map((skill) => {
        const key = groupKey(skill);
        return (
          <DiscoveredSkillRow
            key={key}
            skill={skill}
            agentsByKey={agentsByKey}
            importName={names[key] ?? skill.name}
            importing={Boolean(task(discoveredTaskKey(skill)))}
            disabled={importingAll}
            onRename={(name) => setNames((previous) => ({ ...previous, [key]: name }))}
            onImport={() => void importOne(skill, names[key])}
          />
        );
      })}
    </ul>
  );

  return (
    <div className="flex flex-col gap-6">
      <div className={STATS_GRID_CLASS}>
        <StatCard
          label={t("install.scan.stats.agents")}
          value={scan.data.agentsScanned}
          icon={Bot}
        />
        <StatCard
          label={t("install.scan.stats.found")}
          value={groups.length}
          icon={FolderSearch}
          tone="info"
          hint={t("install.scan.stats.foundHint", { count: scan.data.skillsFound })}
        />
        <StatCard
          label={t("install.scan.stats.pending")}
          value={pending.length}
          icon={Clock}
          tone={pending.length > 0 ? "warning" : "neutral"}
        />
        <StatCard
          label={t("install.scan.stats.imported")}
          value={imported.length}
          icon={Check}
          tone="success"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <p className="flex min-w-0 flex-1 basis-80 items-start gap-2 text-xs leading-5 text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          {t("install.scan.explanation")}
        </p>
        <Button
          variant="outline"
          size="sm"
          disabled={scan.isFetching}
          onClick={() => void scan.refetch()}
        >
          {scan.isFetching ? <Spinner /> : <RotateCw />}
          {t("install.scan.rescan")}
        </Button>
        <Button
          size="sm"
          disabled={pending.length === 0 || importingAll}
          onClick={() => void runImportAll()}
        >
          {importingAll ? <Spinner /> : <PackagePlus />}
          {t("install.scan.importAll", { count: pending.length })}
        </Button>
      </div>

      {batch ? <BatchResultSummary result={batch} onDismiss={() => setBatch(null)} /> : null}

      {groups.length === 0 ? (
        <EmptyState
          icon={Radar}
          title={t("install.scan.emptyTitle")}
          description={t("install.scan.emptyDescription")}
          action={{
            label: t("install.scan.rescan"),
            icon: RotateCw,
            onClick: () => void scan.refetch(),
          }}
        />
      ) : null}

      {pending.length > 0 ? (
        <PageSection title={t("install.scan.pendingTitle", { count: pending.length })}>
          {renderRows(pending)}
        </PageSection>
      ) : groups.length > 0 ? (
        <p className="flex items-center gap-2 rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
          <Check className="size-4 text-success" />
          {t("install.scan.allImported")}
        </p>
      ) : null}

      {imported.length > 0 ? (
        <PageSection title={t("install.scan.importedTitle", { count: imported.length })}>
          {renderRows(imported)}
        </PageSection>
      ) : null}
    </div>
  );
}
