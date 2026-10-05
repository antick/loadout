import type { Skill } from "@loadout/shared";
import type { CoreContext } from "../context";
import type { SkillStore } from "../skills/store";

const DETACHED_DETAIL = "Detached from its source";
const KEPT_AS_MINE_DETAIL = "Detached from its source and marked as yours";

/**
 * Forget a skill's source; its files stay as they are. `markAuthored` also marks it as yours, so
 * no source is looked for again.
 */
export async function detachSkill(
  ctx: CoreContext,
  store: SkillStore,
  skillId: string,
  options: { markAuthored?: boolean } = {},
): Promise<Skill> {
  const mine = options.markAuthored === true;
  const detached = await ctx.lock.run(`detach ${store.get(skillId).name}`, () =>
    store.update(skillId, {
      ...(mine ? { authored: true } : {}),
      sourceType: "local",
      sourceRef: null,
      sourceUrl: null,
      sourceTrustedHost: null,
      sourceSubpath: null,
      sourceBranch: null,
      sourceRevision: null,
      remoteRevision: null,
      updateStatus: "local_only",
      lastCheckError: null,
    }),
  );
  ctx.activity.record("update", detached.name, mine ? KEPT_AS_MINE_DETAIL : DETACHED_DETAIL);
  ctx.touched("skills");
  return detached;
}
