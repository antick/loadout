/**
 * DEV ONLY. `duplicates.*` (possible duplicates in the library) for the browser preview: two skills are a pair when their descriptions
 * share most of their words, or their files hash alike. Merging goes through the other mocks, as
 * the real one goes through the other services.
 */
import {
  type ApplyResult,
  type DuplicateMergeResult,
  type DuplicatePair,
  type DuplicatesReport,
  type Preset,
  type Skill,
  duplicatePairKey,
} from "@loadout/shared";

type Handler = (...args: never[]) => unknown;
type Handlers = Record<string, Handler>;

const SHARED_WORDS_MIN = 0.5;
const WORD_MIN_LENGTH = 4;

function words(text: string | null): Set<string> {
  const found = (text ?? "").toLowerCase().match(/[a-z0-9]+/g) ?? [];
  return new Set(found.filter((word) => word.length >= WORD_MIN_LENGTH));
}

function overlap(left: Set<string>, right: Set<string>): number {
  const shared = [...left].filter((word) => right.has(word)).length;
  const all = new Set([...left, ...right]).size;
  return all === 0 ? 0 : shared / all;
}

/** Calls another mock handler, as the real merge calls the other services. */
function call<T>(handlers: Handlers, channel: string, ...args: unknown[]): Promise<T> {
  const handler = handlers[channel] as ((...values: unknown[]) => T | Promise<T>) | undefined;
  if (!handler) throw new Error(`No mock for ${channel}`);
  return Promise.resolve(handler(...args));
}

export function createSimilarMockHandlers(getSkills: () => Skill[], handlers: Handlers): Handlers {
  const dismissed = new Set<string>();

  function pairs(): DuplicatePair[] {
    const skills = getSkills();
    const found: DuplicatePair[] = [];
    for (const [index, left] of skills.entries()) {
      for (const right of skills.slice(index + 1)) {
        const score = overlap(words(left.description), words(right.description));
        if (score < SHARED_WORDS_MIN) continue;
        const key = duplicatePairKey(left.id, right.id);
        const [a, b] = left.id < right.id ? [left, right] : [right, left];
        found.push({
          key,
          a: a.id,
          b: b.id,
          reason: "name",
          contentScore: score,
          nameScore: score,
          dismissed: dismissed.has(key),
        });
      }
    }
    return found;
  }

  return {
    "duplicates.find": (options?: { includeDismissed?: boolean }): DuplicatesReport => ({
      pairs: pairs().filter((pair) => options?.includeDismissed === true || !pair.dismissed),
      dismissedCount: dismissed.size,
    }),
    "duplicates.dismiss": (idA: string, idB: string) =>
      void dismissed.add(duplicatePairKey(idA, idB)),
    "duplicates.undismiss": (idA: string, idB: string) =>
      void dismissed.delete(duplicatePairKey(idA, idB)),
    "duplicates.merge": async (
      keepId: string,
      removeId: string,
      options?: { dryRun?: boolean },
    ): Promise<DuplicateMergeResult> => {
      const skills = getSkills();
      const keep = skills.find((skill) => skill.id === keepId);
      const remove = skills.find((skill) => skill.id === removeId);
      if (!keep || !remove) throw new Error("There is no such skill.");
      const tags = remove.tags.filter((tag) => !keep.tags.includes(tag));
      const presets = await call<Preset[]>(handlers, "presets.list");
      const joining = presets.filter(
        (preset) => preset.skillIds.includes(removeId) && !preset.skillIds.includes(keepId),
      );
      const wanted = remove.deployments.map((entry) => entry.agentKey);
      const blockedFor = wanted.filter((key) => keep.blockedAgents.includes(key));
      const deployedTo = wanted.filter(
        (key) =>
          !blockedFor.includes(key) && !keep.deployments.some((entry) => entry.agentKey === key),
      );
      const result: DuplicateMergeResult = {
        keptId: keepId,
        removedId: removeId,
        tagsAdded: tags.length,
        presetsJoined: joining.length,
        deployedTo,
        blockedFor,
        removedEntryId: null,
      };
      if (options?.dryRun === true) return result;
      if (tags.length > 0) {
        await call(handlers, "skills.setTags", keepId, [...keep.tags, ...tags]);
      }
      for (const preset of joining) await call(handlers, "presets.addSkills", preset.id, [keepId]);
      if (deployedTo.length > 0) {
        await call<ApplyResult>(handlers, "deploy.apply", [keepId], deployedTo, "add");
      }
      const removed = await call<{ removedIds: string[] }>(handlers, "skills.removeMany", [
        removeId,
      ]);
      return { ...result, removedEntryId: removed.removedIds[0] ?? null };
    },
  };
}
