import type { NewSourceSkill } from "@loadout/shared";
import type { CoreContext } from "../context";
import { INTERNAL_KEYS } from "../settings/store";

/** What this computer knows about one repository's skills. */
export interface RepositoryState {
  /** The commit last looked at. */
  revision: string;
  /** Repository paths offered already: installed, skipped in an import, or dismissed. */
  seen: string[];
  /** Skills at `revision` that are in none of the above: the news. */
  found: NewSourceSkill[];
  checkedAt: number;
}

/**
 * Per repository (`SkillSource.key`): which of its skills were already offered, and which it
 * gained since. Kept on this computer only, in the settings table.
 */
export interface SourceNewsStore {
  all(): Record<string, RepositoryState>;
  get(sourceKey: string): RepositoryState | null;
  set(sourceKey: string, state: RepositoryState): void;
  /**
   * An import listed these paths of the repository, so none of them is news any more. With a
   * `revision`, a repository never looked at before starts from that list; without one it is
   * left for its first check, which takes everything there as already known.
   */
  markSeen(sourceKey: string, paths: readonly string[], revision: string | null): void;
  /** Stop offering these paths (all current news when omitted). */
  dismiss(sourceKey: string, paths?: readonly string[]): void;
}

export function createSourceNewsStore(ctx: CoreContext): SourceNewsStore {
  const read = (): Record<string, RepositoryState> =>
    ctx.settings.getRaw<Record<string, RepositoryState>>(INTERNAL_KEYS.sourceNews, {});
  const write = (all: Record<string, RepositoryState>): void => {
    ctx.settings.setRaw(INTERNAL_KEYS.sourceNews, all);
    ctx.touched("skills");
  };

  function forget(sourceKey: string, paths: readonly string[]): void {
    const all = read();
    const state = all[sourceKey];
    if (!state) return;
    const gone = new Set(paths);
    all[sourceKey] = {
      ...state,
      seen: [...new Set([...state.seen, ...paths])],
      found: state.found.filter((skill) => !gone.has(skill.path)),
    };
    write(all);
  }

  return {
    all: read,
    get: (sourceKey) => read()[sourceKey] ?? null,
    set: (sourceKey, state) => write({ ...read(), [sourceKey]: state }),

    markSeen: (sourceKey, paths, revision) => {
      if (read()[sourceKey]) {
        forget(sourceKey, paths);
      } else if (revision) {
        write({
          ...read(),
          [sourceKey]: { revision, seen: [...paths], found: [], checkedAt: Date.now() },
        });
      }
    },

    dismiss: (sourceKey, paths) => {
      const state = read()[sourceKey];
      if (!state) return;
      forget(sourceKey, paths ?? state.found.map((skill) => skill.path));
    },
  };
}
