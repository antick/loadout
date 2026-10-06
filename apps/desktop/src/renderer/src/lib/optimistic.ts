import type { Skill } from "@loadout/shared";
import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { keys } from "@/lib/query-keys";

/** What cache entries held before an instant change, to put back if the backend refuses it. */
export type CacheSnapshot = readonly (readonly [QueryKey, unknown])[];

/**
 * Change one cached entry before the backend answers, after stopping its fetches so an answer in
 * flight does not undo the change. Nothing happens when it is not cached.
 */
export async function patchCached<T>(
  queryClient: QueryClient,
  key: QueryKey,
  patch: (data: T) => T,
): Promise<CacheSnapshot> {
  await queryClient.cancelQueries({ queryKey: key });
  const previous = queryClient.getQueryData<T>(key);
  if (previous === undefined) return [];
  queryClient.setQueryData<T>(key, patch(previous));
  return [[key, previous]];
}

/** Change one skill wherever it is cached: in the list and in its own entry (the skill panel). */
export async function patchCachedSkill(
  queryClient: QueryClient,
  skillId: string,
  patch: (skill: Skill) => Skill,
): Promise<CacheSnapshot> {
  const inList = await patchCached<Skill[]>(queryClient, keys.skills.all, (list) =>
    list.map((skill) => (skill.id === skillId ? patch(skill) : skill)),
  );
  return [
    ...inList,
    ...(await patchCached<Skill>(queryClient, keys.skills.detail(skillId), patch)),
  ];
}

/**
 * Put back what an instant change replaced, when the backend refused it, then fetch the truth:
 * another instant change made meanwhile was taken back with it, or put back over it.
 */
export function restoreCached(queryClient: QueryClient, snapshot: CacheSnapshot | undefined): void {
  for (const [key, data] of snapshot ?? []) {
    queryClient.setQueryData(key, data);
    void queryClient.invalidateQueries({ queryKey: key, exact: true });
  }
}

/** A skill as a snapshot of the skills list, or of its own entry, held it. */
export function skillInSnapshot(
  snapshot: CacheSnapshot | undefined,
  skillId: string,
): Skill | undefined {
  for (const [, data] of snapshot ?? []) {
    const found = Array.isArray(data)
      ? (data as Skill[]).find((skill) => skill.id === skillId)
      : (data as Skill | undefined);
    if (found?.id === skillId) return found;
  }
  return undefined;
}
