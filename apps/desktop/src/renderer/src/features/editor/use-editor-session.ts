import { ApiError, type SaveSkillFileResult, type SkillFile } from "@loadout/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { clearDraft, readDraft, writeDraft } from "@/features/editor/editor-drafts";
import {
  type FileSession,
  afterSave,
  applyDiskVersion,
  isDirty,
  keepMine,
  openSession,
  revertToDisk,
  withDraft,
} from "@/features/editor/editor-session";
import { useSaveSkillFile } from "@/hooks/mutations/skill-files";
import { api } from "@/lib/api";
import { EDITOR_DRAFT_SAVE_MS } from "@/lib/constants";

export type SaveOutcome =
  | { kind: "saved"; result: SaveSkillFileResult }
  | { kind: "conflict"; disk: SkillFile | null }
  | { kind: "failed"; error: unknown };

export interface EditorSession {
  sessions: Readonly<Record<string, FileSession>>;
  /** A version of `file` was read from disk. */
  sync(file: SkillFile): void;
  setDraft(path: string, draft: string): void;
  save(path: string, options?: { overwrite?: boolean }): Promise<SaveOutcome>;
  /** Paths currently being saved. */
  saving: ReadonlySet<string>;
  revert(path: string): void;
  keepMine(path: string): void;
  /** Put earlier text in the editor as an unsaved change. */
  replaceDraft(path: string, content: string): void;
  /** Throw away every unsaved change, including the copies kept in localStorage. */
  discardAll(): void;
  dirtyPaths: string[];
}

/**
 * Every file opened in the editor for one skill: its draft, the version it is based on and the
 * newest version seen on disk. Drafts are mirrored to localStorage while unsaved.
 */
export function useEditorSession(skillId: string): EditorSession {
  const [sessions, setSessions] = useState<Record<string, FileSession>>({});
  const [saving, setSaving] = useState<ReadonlySet<string>>(new Set());
  const latest = useRef(sessions);
  /** Set once the user discarded everything, so leaving does not store the drafts again. */
  const discarded = useRef(false);
  useEffect(() => {
    latest.current = sessions;
  });
  const saveFile = useSaveSkillFile();
  const { mutateAsync } = saveFile;

  const update = useCallback((path: string, change: (session: FileSession) => FileSession) => {
    setSessions((previous) => {
      const session = previous[path];
      if (!session) return previous;
      const next = change(session);
      return next === session ? previous : { ...previous, [path]: next };
    });
  }, []);

  const sync = useCallback(
    (file: SkillFile) => {
      setSessions((previous) => {
        const session = previous[file.path];
        const next = session
          ? applyDiskVersion(session, file)
          : openSession(file, readDraft(skillId, file.path));
        return next === session ? previous : { ...previous, [file.path]: next };
      });
    },
    [skillId],
  );

  const save = useCallback(
    async (path: string, options: { overwrite?: boolean } = {}): Promise<SaveOutcome> => {
      const session = latest.current[path];
      if (!session) return { kind: "failed", error: new Error(`${path} is not open`) };
      const content = session.draft;
      setSaving((previous) => new Set(previous).add(path));
      try {
        const result = await mutateAsync({
          skillId,
          input: { path, content, baseHash: session.baseHash, overwrite: options.overwrite },
        });
        // The stored draft goes with the next mirror pass once nothing is left unsaved.
        update(path, (current) => afterSave(current, result.file));
        return { kind: "saved", result };
      } catch (error) {
        if (error instanceof ApiError && error.code === "CHANGED_ON_DISK") {
          const disk = await api.skills.readFile(skillId, path).catch(() => null);
          if (disk) update(path, (current) => applyDiskVersion(current, disk));
          return { kind: "conflict", disk };
        }
        return { kind: "failed", error };
      } finally {
        setSaving((previous) => {
          const next = new Set(previous);
          next.delete(path);
          return next;
        });
      }
    },
    [mutateAsync, skillId, update],
  );

  // Mirror unsaved drafts to localStorage after a short pause, and at once when the page goes.
  useEffect(() => {
    const flush = (): void => {
      for (const session of Object.values(sessions)) {
        if (isDirty(session)) {
          writeDraft(skillId, session.path, {
            baseHash: session.baseHash,
            content: session.draft,
            savedAt: Date.now(),
          });
        } else {
          clearDraft(skillId, session.path);
        }
      }
    };
    const timer = window.setTimeout(flush, EDITOR_DRAFT_SAVE_MS);
    window.addEventListener("pagehide", flush);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pagehide", flush);
    };
  }, [sessions, skillId]);

  // Leaving the page (or switching skill) writes whatever is still unsaved right away.
  useEffect(
    () => () => {
      if (discarded.current) return;
      for (const session of Object.values(latest.current)) {
        if (!isDirty(session)) continue;
        writeDraft(skillId, session.path, {
          baseHash: session.baseHash,
          content: session.draft,
          savedAt: Date.now(),
        });
      }
    },
    [skillId],
  );

  const dirtyPaths = useMemo(
    () =>
      Object.values(sessions)
        .filter(isDirty)
        .map((session) => session.path)
        .sort(),
    [sessions],
  );

  return {
    sessions,
    sync,
    setDraft: (path, draft) => update(path, (session) => withDraft(session, draft)),
    save,
    saving,
    revert: (path) => {
      update(path, revertToDisk);
      clearDraft(skillId, path);
    },
    keepMine: (path) => update(path, keepMine),
    replaceDraft: (path, content) => update(path, (session) => withDraft(session, content)),
    discardAll: () => {
      discarded.current = true;
      for (const path of Object.keys(latest.current)) clearDraft(skillId, path);
      setSessions((previous) =>
        Object.fromEntries(
          Object.entries(previous).map(([path, session]) => [path, revertToDisk(session)]),
        ),
      );
    },
    dirtyPaths,
  };
}
