import type { SafetyRecord, SafetyStatus } from "@loadout/shared";
import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { keys } from "@/lib/query-keys";

/** Whether the scanner is installed, which one, and whether installs are checked. */
export function useSafetyStatus(): UseQueryResult<SafetyStatus> {
  return useQuery({ queryKey: keys.safety.status, queryFn: () => api.safety.status() });
}

const NO_REPORTS: ReadonlyMap<string, SafetyRecord> = new Map();
/** One index per answer, shared by every caller: each card of a long list reads the same one. */
const indexes = new WeakMap<readonly SafetyRecord[], ReadonlyMap<string, SafetyRecord>>();

function indexOf(records: readonly SafetyRecord[]): ReadonlyMap<string, SafetyRecord> {
  let index = indexes.get(records);
  if (!index) {
    index = new Map(records.map((record) => [record.skillId, record]));
    indexes.set(records, index);
  }
  return index;
}

/** The last safety report of every library skill that has one, by skill id. */
export function useSafetyReports(): ReadonlyMap<string, SafetyRecord> {
  const { data } = useQuery({ queryKey: keys.safety.list, queryFn: () => api.safety.list() });
  return data ? indexOf(data) : NO_REPORTS;
}
