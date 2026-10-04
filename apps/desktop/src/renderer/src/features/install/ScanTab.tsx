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
import { DiscoveredSkillRow, type SkillVersionPlace } from "@/features/install/DiscoveredSkillRow";
import {
  IMPORT_ALL_DISCOVERED_KEY,
  discoveredTaskKey,
  useImportAllDiscovered,
  useImportDiscovered,
} from "@/features/install/install-mutations";
import { useScanLocal } from "@/features/install/install-queries";
import { useInstallTask } from "@/features/install/use-install-task";
import { useAgents } from "@/hooks/queries/agents";
import { Skeletons } from "@/components/Skeletons";

const STATS_GRID_CLASS = "grid grid-cols-2 gap-3 lg:grid-cols-4";

/** Stable identity of a discovered group across rescans. */
function groupKey(skill: DiscoveredSkill): string {
  return `${skill.name}::${skill.fingerprint}`;
}

/**
 * Groups that share a name but hold different files are versions of one skill: which one each
 * is (1-based) and how many there are, keyed by `groupKey`. Unique names are left out.
 */
function versionsOf(groups: readonly DiscoveredSkill[]): Map<string, SkillVersionPlace> {
  const byName = new Map<string, DiscoveredSkill[]>();
  for (const group of groups) {
    const name = group.name.toLowerCase();
    byName.set(name, [...(byName.get(name) ?? []), group]);
  }
  const versions = new Map<string, SkillVersionPlace>();
  for (const same of byName.values()) {
    if (same.length < 2) continue;
    same.forEach((group, index) => {
      versions.set(groupKey(group), { index: index + 1, total: same.length });
    });
  }
  return versions;
}

function ScanSkeleton(): ReactNode {
  return (
    <div className="flex flex-col gap-6" aria-hidden="true">
      <div className={STATS_GRID_CLASS}>
        <Skeletons count={SCAN_STAT_COUNT} className="h-20 rounded-lg" />
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
  const found = scan.data?.skills;
  const groups = found ?? [];
  const versions = useMemo(() => versionsOf(found ?? []), [found]);
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
        const version = versions.get(key) ?? null;
        // A later version gets a name of its own, so the library never holds two of one name.
        const suggested =
          version && version.index > 1 ? `${skill.name}-${version.index}` : skill.name;
        const importName = names[key] ?? suggested;
        return (
          <DiscoveredSkillRow
            key={key}
            skill={skill}
            version={version}
            agentsByKey={agentsByKey}
            importName={importName}
            importing={Boolean(task(discoveredTaskKey(skill)))}
            disabled={importingAll}
            onRename={(name) => setNames((previous) => ({ ...previous, [key]: name }))}
            onImport={() =>
              void importOne(skill, importName === skill.name ? names[key] : importName)
            }
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
