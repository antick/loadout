import { randomUUID } from "node:crypto";
import type {
  ConfirmOptions,
  InstallOptions,
  InstallPhase,
  InstallProgress,
  InstallSelection,
  PreviewedSkill,
  SafetyReport,
  Skill,
} from "@loadout/shared";
import { MINUTE_MS } from "@loadout/shared";
import type { CoreContext } from "../context";
import { AppError, errorMessage, invalid } from "../errors";
import type { SkillStore } from "../skills/store";
import type { InstallIntoLibrary, InstallRecord } from "./library";
import { readCheckedSkill } from "./read-skill";
import { type ReplaceDeps, installReplacing, skillHoldingName } from "./replace";
import type { SafetyGate } from "./safety-gate";

/**
 * Something fetched and unpacked (a repository checkout, an archive) that the user is still
 * choosing skills from. Confirm only ever installs folders the preview itself listed.
 */
export interface PreviewSession {
  /** Progress key: the text exactly as the caller passed it, so its listener matches. */
  key: string;
  /** Preview key → folder. */
  dirs: Map<string, string>;
  /** Source fields of a skill installed from `dir`. */
  record(dir: string): InstallRecord;
  /**
   * Fetch all files of these folders; a repository preview only has the skill documents until
   * then. Absent when every file is already there.
   */
  materialize?(dirs: readonly string[]): Promise<void>;
  cleanup(): Promise<void>;
  /** Host of another site the download moved to; confirming needs `acceptRedirect`. */
  redirectedTo?: string | null;
  /** Called once the chosen skills are in: the rest of the list was seen and skipped. */
  confirmed?(): void;
}

export interface PreviewSessions {
  /** Keep a session; returns its id. */
  open(session: PreviewSession): Promise<string>;
  confirm(previewId: string, items: InstallSelection[], options?: ConfirmOptions): Promise<Skill[]>;
  /** One listed skill's `SKILL.md` after the safety check. The preview stays open. */
  read(previewId: string, relPath: string, options?: InstallOptions): Promise<PreviewedSkill>;
  cancel(previewId: string): Promise<void>;
  /** Delete every session still waiting for a confirm. Call on shutdown. */
  dispose(): Promise<void>;
}

export const PREVIEW_TTL_MS = 30 * MINUTE_MS;
const SESSION_EXPIRED = "Preview expired, please try again";

export function emitProgress(
  ctx: CoreContext,
  key: string,
  phase: InstallPhase,
  extra: Partial<InstallProgress> = {},
): void {
  ctx.emit("install:progress", { key, phase, ...extra });
}

export interface PreviewSessionDeps {
  install: InstallIntoLibrary;
  store: SkillStore;
  safety: SafetyGate;
  /** How a ticked "replace" puts a skill in place of the library skill holding its name. */
  replace: ReplaceDeps;
}

/**
 * The error a confirm ends with when some skills could not be installed. Alone, a failure is
 * passed on as it is. Next to installed skills, it names both: `details.installed` lists what
 * each chosen row became, in order, null where it failed; `details.failed` says why.
 */
function partlyInstalled(
  done: readonly Skill[],
  failures: readonly { name: string; error: unknown }[],
  installed: readonly (Skill | null)[],
): unknown {
  const [first] = failures;
  if (done.length === 0 && failures.length === 1) return first?.error;
  const failed = failures.map(({ name, error }) => ({ name, message: errorMessage(error) }));
  const named = failed.map((entry) => `${entry.name}: ${entry.message}`).join("; ");
  const code = first?.error instanceof AppError ? first.error.code : "IO";
  const message =
    done.length > 0
      ? `Installed ${done.map((skill) => skill.name).join(", ")}. Could not install ${named}`
      : `Could not install ${named}`;
  return new AppError(code, message, { installed, failed });
}

export function createPreviewSessions(ctx: CoreContext, deps: PreviewSessionDeps): PreviewSessions {
  const { install, store, safety } = deps;
  const sessions = new Map<string, PreviewSession & { createdAt: number }>();

  /** Previews nobody confirmed or cancelled would otherwise keep their temp folder forever. */
  async function sweepExpired(): Promise<void> {
    const cutoff = Date.now() - PREVIEW_TTL_MS;
    for (const [id, session] of sessions) {
      if (session.createdAt > cutoff) continue;
      sessions.delete(id);
      await session.cleanup();
    }
  }

  return {
    open: async (session) => {
      await sweepExpired();
      const id = randomUUID();
      sessions.set(id, { ...session, createdAt: Date.now() });
      return id;
    },

    confirm: async (previewId, items, options = {}) => {
      await sweepExpired();
      const session = sessions.get(previewId);
      if (!session) throw invalid(SESSION_EXPIRED);
      // Checked before the session is spent, so the user can still confirm the host and retry.
      if (session.redirectedTo && !options.acceptRedirect) {
        throw invalid(
          `The download moved to ${session.redirectedTo}. Confirm you trust that site to install from it.`,
        );
      }
      // An unknown key stays in the list: it fails in turn below, as it always has.
      const chosen = items.map((item) => ({
        item,
        dir: session.dirs.get(item.relPath) ?? null,
        name: item.name.trim() || item.relPath,
      }));
      // Also before the session is spent: after reading the findings the user can still say yes.
      const checkable = chosen.flatMap(({ dir, name }) => (dir ? [{ name, dir }] : []));
      // Whole folders before anything reads them: the safety check, then the install.
      let checked: (SafetyReport | null)[];
      try {
        await session.materialize?.(checkable.map((entry) => entry.dir));
        checked = await safety.check(checkable, {
          acceptRisk: options.acceptRisk,
          progressKey: session.key,
        });
      } catch (error) {
        // Flagged and not accepted, or unreadable: the status bar stops saying "Checking…".
        emitProgress(ctx, session.key, "done");
        throw error;
      }
      const reportOf = new Map(
        checkable.map((entry, index) => [entry.dir, checked[index] ?? null]),
      );
      // Taken out first: a second confirm must not race this one for the same folder.
      if (!sessions.has(previewId)) throw invalid(SESSION_EXPIRED);
      sessions.delete(previewId);
      try {
        // One skill failing does not stop the rest; what happened to each is said at the end.
        const installed: (Skill | null)[] = [];
        const failures: { name: string; error: unknown }[] = [];
        for (const [index, { item, dir, name }] of chosen.entries()) {
          emitProgress(ctx, session.key, "installing", {
            current: index + 1,
            total: chosen.length,
            name,
          });
          try {
            if (!dir) throw invalid(`'${item.relPath}' is not one of the skills in this preview`);
            const request = { sourceDir: dir, name: item.name, record: session.record(dir) };
            // Looked up now, not at preview time: an earlier row may have just taken the name.
            const owner = item.replace ? skillHoldingName(store, name) : null;
            const skill = owner
              ? await installReplacing(ctx, install, deps.replace, owner, request)
              : await install(request);
            safety.remember(skill, reportOf.get(dir) ?? null);
            installed.push(skill);
          } catch (error) {
            installed.push(null);
            failures.push({ name, error });
          }
        }
        const done = installed.filter((skill): skill is Skill => skill !== null);
        if (done.length > 0) session.confirmed?.();
        if (failures.length > 0) throw partlyInstalled(done, failures, installed);
        return done;
      } finally {
        // Installed or failed halfway, the status bar stops showing the install.
        emitProgress(ctx, session.key, "done");
        await session.cleanup();
      }
    },

    read: async (previewId, relPath, options = {}) => {
      await sweepExpired();
      const session = sessions.get(previewId);
      if (!session) throw invalid(SESSION_EXPIRED);
      const dir = session.dirs.get(relPath);
      if (!dir) throw invalid(`'${relPath}' is not one of the skills in this preview`);
      // The whole folder: the safety check reads its scripts, not just the document.
      await session.materialize?.([dir]);
      try {
        return await readCheckedSkill(
          safety,
          { name: relPath, dir },
          {
            ...options,
            progressKey: session.key,
          },
        );
      } finally {
        emitProgress(ctx, session.key, "done");
      }
    },

    cancel: async (previewId) => {
      const session = sessions.get(previewId);
      sessions.delete(previewId);
      await session?.cleanup();
      await sweepExpired();
    },

    dispose: async () => {
      const open = [...sessions.values()];
      sessions.clear();
      for (const session of open) await session.cleanup();
    },
  };
}
