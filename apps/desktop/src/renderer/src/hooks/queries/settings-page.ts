import type { CliStatus } from "@skillboard/shared";
import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { keys } from "@/lib/query-keys";

/** Where the command-line tool was published and which version it is. */
export function useCliStatus(): UseQueryResult<CliStatus> {
  return useQuery({ queryKey: keys.system.cliStatus, queryFn: () => api.system.cliStatus() });
}
