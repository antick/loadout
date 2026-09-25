import { randomUUID } from "node:crypto";
import type {
  ConfirmOptions,
  InstallPhase,
  InstallProgress,
  InstallSelection,
  Skill,
} from "@loadout/shared";
import type { CoreContext } from "../context";
import { invalid } from "../errors";
import type { InstallIntoLibrary, InstallRecord } from "./library";

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
  cleanup(): Promise<void>;
  /** Host of another site the download moved to; confirming needs `acceptRedirect`. */
  redirectedTo?: string | null;
}

export interface PreviewSessions {
  /** Keep a session; returns its id. */
  open(session: PreviewSession): Promise<string>;
  confirm(previewId: string, items: InstallSelection[], options?: ConfirmOptions): Promise<Skill[]>;
  cancel(previewId: string): Promise<void>;
  /** Delete every session still waiting for a confirm. Call on shutdown. */
  dispose(): Promise<void>;
}

const PREVIEW_TTL_MS = 30 * 60_000;
const SESSION_EXPIRED = "Preview expired, please try again";

export function emitProgress(
  ctx: CoreContext,
  key: string,
  phase: InstallPhase,
  extra: Partial<InstallProgress> = {},
): void {
  ctx.emit("install:progress", { key, phase, ...extra });
}

export function createPreviewSessions(
  ctx: CoreContext,
  install: InstallIntoLibrary,
  ttlMs: number = PREVIEW_TTL_MS,
): PreviewSessions {
  const sessions = new Map<string, PreviewSession & { createdAt: number }>();

  /** Previews nobody confirmed or cancelled would otherwise keep their temp folder forever. */
  async function sweepExpired(): Promise<void> {
    const cutoff = Date.now() - ttlMs;
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
      // Taken out first: a second confirm must not race this one for the same folder.
      sessions.delete(previewId);
      try {
        const installed: Skill[] = [];
        for (const [index, item] of items.entries()) {
          const dir = session.dirs.get(item.relPath);
          if (!dir) throw invalid(`'${item.relPath}' is not one of the skills in this preview`);
          emitProgress(ctx, session.key, "installing", {
            current: index + 1,
            total: items.length,
            name: item.name.trim() || item.relPath,
          });
          installed.push(
            await install({ sourceDir: dir, name: item.name, record: session.record(dir) }),
          );
        }
        emitProgress(ctx, session.key, "done");
        return installed;
      } finally {
        await session.cleanup();
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
