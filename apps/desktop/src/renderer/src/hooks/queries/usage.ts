import { type SkillUsage, USAGE_STALE_MS, type UsageReport, usageById } from "@loadout/shared";
import {
  type UseQueryResult,
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { api } from "@/lib/api";
import { keys } from "@/lib/query-keys";

export function useUsageReport(): UseQueryResult<UsageReport> {
  return useQuery({ queryKey: keys.usage.report, queryFn: () => api.usage.report() });
}

export interface SkillUsageView {
  /** Tracking is on. */
  enabled: boolean;
  report: UsageReport | undefined;
  /** Usage of each skill by id; empty while tracking is off. */
  byId: ReadonlyMap<string, SkillUsage>;
  /** The logs are being read right now. */
  scanning: boolean;
  /** Read what the logs gained since the last look. */
  refresh: () => void;
}

/**
 * Skill usage for a view that shows it. While tracking is on and the last read is older than
 * `USAGE_STALE_MS`, the logs are read again in the background (core runs one read at a time).
 */
export function useSkillUsage(): SkillUsageView {
  const queryClient = useQueryClient();
  const report = useUsageReport();
  const scanning = useIsMutating({ mutationKey: keys.usage.scan }) > 0;
  const scan = useMutation({
    mutationKey: keys.usage.scan,
    mutationFn: () => api.usage.scan(),
    onSuccess: (next) => queryClient.setQueryData(keys.usage.report, next),
  });
  const { mutate } = scan;
  const enabled = report.data?.enabled === true;
  const scannedAt = report.data?.scannedAt ?? null;

  useEffect(() => {
    if (!enabled || scanning) return;
    if (scannedAt === null || Date.now() - scannedAt > USAGE_STALE_MS) mutate();
    // Only a change in what was read asks again; a failed read waits for the next visit.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, scannedAt, mutate]);

  const byId = useMemo(() => usageById(report.data), [report.data]);
  return { enabled, report: report.data, byId, scanning, refresh: () => mutate() };
}
