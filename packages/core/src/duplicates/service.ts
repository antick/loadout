import {
  type CoreApi,
  type DuplicateMergeResult,
  type DuplicatePair,
  type DuplicatesApi,
  type Skill,
  duplicatePairKey,
} from "@loadout/shared";
import type { CoreContext } from "../context";
import { AppError, invalid, targetConflict } from "../errors";
import { INTERNAL_KEYS } from "../settings/store";
import { readSkillDocument } from "../skills/metadata";
import type { SkillStore } from "../skills/store";
import { type SimilarPair, type SimilarityInput, findSimilarPairsInSlices } from "./similar";

/** One look through the library; `pairs` is null once a newer look replaced it. */
interface Look {
  fingerprint: string;
  similarText: boolean;
  pairs: Promise<SimilarPair[] | null>;
}

/** The parts of the other services a merge is made of. */
export type DuplicatesDeps = {
  store: SkillStore;
  api: Pick<CoreApi, "skills" | "presets" | "deploy">;
};

interface MergePlan {
  tags: string[];
  presetIds: string[];
  deployedTo: string[];
  blockedFor: string[];
}

export interface DuplicatesService {
  api: DuplicatesApi;
}

export function createDuplicatesService(ctx: CoreContext, deps: DuplicatesDeps): DuplicatesService {
  const { store } = deps;
  const { skills, presets, deploy } = deps.api;

  /** Keys of dismissed pairs whose two skills are still in the library. */
  function dismissedKeys(): Set<string> {
    const stored = ctx.settings.getRaw<string[]>(INTERNAL_KEYS.duplicatesDismissed, []);
    const ids = new Set(store.list().map((skill) => skill.id));
    return new Set(
      stored.filter((key) => {
        const [a, b] = key.split(":");
        return a !== undefined && b !== undefined && ids.has(a) && ids.has(b);
      }),
    );
  }

  /**
   * The last look, kept while no skill's files, name or description changed: the app asks
   * whenever the library changes, and deploying a skill must not compare anything again. Only one
   * look runs at a time: a new one stops the one before at its next slice, through `generation`.
   */
  let current: Look | null = null;
  let generation = 0;

  /** The look under way or done for the library as it is now, else a new one. */
  function lookAt(similarText: boolean): Look {
    const library = store.list();
    const fingerprint = library
      .map((skill) =>
        [skill.id, skill.name, skill.description ?? "", skill.contentHash ?? skill.updatedAt].join(
          "\u0000",
        ),
      )
      .sort()
      .join("\u0001");
    // A look that compared the text answers one that did not ask to.
    if (current?.fingerprint === fingerprint && (current.similarText || !similarText)) {
      return current;
    }
    generation += 1;
    const mine = generation;
    const inputs: SimilarityInput[] = library.map((skill) => ({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      // Only a look at the text needs to read every document.
      document: similarText ? (readSkillDocument(skill.libraryPath)?.content ?? "") : "",
      contentHash: skill.contentHash,
    }));
    // Compared in slices without the library lock, so other calls go on meanwhile.
    const pairs = findSimilarPairsInSlices(inputs, {
      similarText,
      stillWanted: () => generation === mine,
    });
    const look: Look = { fingerprint, similarText, pairs };
    current = look;
    pairs.catch(() => {
      if (current === look) current = null;
    });
    return look;
  }

  async function similarPairs(
    similarText: boolean,
  ): Promise<{ pairs: SimilarPair[]; similarText: boolean }> {
    for (;;) {
      const look = lookAt(similarText);
      const pairs = await look.pairs;
      if (pairs) return { pairs, similarText: look.similarText };
      // A newer look replaced this one: ask again, which joins it or starts the one wanted.
    }
  }

  function changeDismissed(idA: string, idB: string, dismissed: boolean): void {
    if (idA === idB) throw invalid("Pick two different skills.");
    store.get(idA);
    store.get(idB);
    const keys = dismissedKeys();
    const key = duplicatePairKey(idA, idB);
    if (dismissed) keys.add(key);
    else keys.delete(key);
    ctx.settings.setRaw(INTERNAL_KEYS.duplicatesDismissed, [...keys].sort());
  }

  /** What the kept skill takes over from the removed one. Reads only. */
  async function planMerge(keep: Skill, remove: Skill): Promise<MergePlan> {
    const tags = remove.tags.filter((tag) => !keep.tags.includes(tag));
    const presetIds = (await presets.list())
      .filter((preset) => preset.skillIds.includes(remove.id) && !preset.skillIds.includes(keep.id))
      .map((preset) => preset.id);
    const wanted = remove.deployments.map((entry) => entry.agentKey);
    const blockedFor = wanted.filter((agentKey) => keep.blockedAgents.includes(agentKey));
    const deployedTo = wanted.filter(
      (agentKey) =>
        !blockedFor.includes(agentKey) &&
        !keep.deployments.some((entry) => entry.agentKey === agentKey),
    );
    return { tags, presetIds, deployedTo, blockedFor };
  }

  /** Give the kept skill what the removed one had. Only ever adds, so a failure loses nothing. */
  async function carryOver(keep: Skill, remove: Skill, plan: MergePlan): Promise<void> {
    if (plan.tags.length > 0) await skills.setTags(keep.id, [...keep.tags, ...plan.tags]);
    for (const presetId of plan.presetIds) {
      await presets.addSkills(presetId, [keep.id]);
      for (const toggle of await presets.toggles(presetId, remove.id)) {
        // A switch that was off stays off; on is what a new preset member starts as.
        if (!toggle.enabled) await presets.setToggle(presetId, keep.id, toggle.agentKey, false);
      }
    }
    if (plan.deployedTo.length === 0) return;
    const applied = await deploy.apply([keep.id], plan.deployedTo, "add");
    if (applied.conflicts.length > 0) throw targetConflict(applied.conflicts);
    const [failure] = applied.failed;
    if (failure) throw new AppError("IO", `Could not deploy ${keep.name}: ${failure.message}`);
  }

  const api: DuplicatesApi = {
    find: async (options = {}) => {
      const found = await similarPairs(options.similarText === true);
      const dismissed = dismissedKeys();
      const pairs: DuplicatePair[] = [];
      for (const pair of found.pairs) {
        const isDismissed = dismissed.has(pair.key);
        if (options.includeDismissed === true || !isDismissed) {
          pairs.push({ ...pair, dismissed: isDismissed });
        }
      }
      return { pairs, dismissedCount: dismissed.size, similarText: found.similarText };
    },

    dismiss: async (idA, idB) => changeDismissed(idA, idB, true),

    undismiss: async (idA, idB) => changeDismissed(idA, idB, false),

    merge: async (keepId, removeId, options = {}) => {
      if (keepId === removeId) throw invalid("Pick two different skills.");
      const keep = store.get(keepId);
      const remove = store.get(removeId);
      const plan = await planMerge(keep, remove);
      const result: DuplicateMergeResult = {
        keptId: keepId,
        removedId: removeId,
        tagsAdded: plan.tags.length,
        presetsJoined: plan.presetIds.length,
        deployedTo: plan.deployedTo,
        blockedFor: plan.blockedFor,
        removedEntryId: null,
      };
      if (options.dryRun === true) {
        // Refuses now what the real merge would refuse, so a preview does not promise too much.
        if (plan.deployedTo.length > 0) {
          const preview = await deploy.apply([keepId], plan.deployedTo, "add", { dryRun: true });
          if (preview.conflicts.length > 0) throw targetConflict(preview.conflicts);
        }
        return result;
      }
      try {
        await carryOver(keep, remove, plan);
      } catch (error) {
        // Nothing was removed: what was added to the kept skill is harmless and stays.
        ctx.log.warn("Could not carry a duplicate's settings over; it was not removed", error);
        throw error;
      }
      const removed = await skills.removeMany([removeId]);
      const [failure] = removed.failed;
      if (failure) throw new AppError("IO", `Could not remove ${failure.name}: ${failure.message}`);
      return { ...result, removedEntryId: removed.removedIds[0] ?? null };
    },
  };

  return { api };
}
