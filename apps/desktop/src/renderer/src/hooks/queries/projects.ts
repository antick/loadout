import type { Project } from "@loadout/shared";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { keys } from "@/lib/query-keys";

/** Every linked project in sidebar order, with skill counts and sync health. */
export function useProjects(): UseQueryResult<Project[]> {
  return useQuery({ queryKey: keys.projects.all, queryFn: () => api.projects.list() });
}
