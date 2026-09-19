import {
  DEFAULT_SETTINGS,
  type SettingKey,
  type SettingValue,
  type Settings,
} from "@skillboard/shared";
import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { keys } from "@/lib/query-keys";

/** Every user setting. */
export function useSettings(): UseQueryResult<Settings> {
  return useQuery({ queryKey: keys.settings.all, queryFn: () => api.settings.all() });
}

/** One setting's value; the shared default until settings have loaded. */
export function useSetting<K extends SettingKey>(key: K): SettingValue<K> {
  const { data } = useSettings();
  return (data ?? DEFAULT_SETTINGS)[key];
}
