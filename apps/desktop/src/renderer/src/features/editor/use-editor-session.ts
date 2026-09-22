import {
  ApiError,
  type OtherCopiesMode,
  type SaveSkillFileResult,
  type SkillFile,
  type SkillLocation,
} from "@loadout/shared";
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
import { useSaveSkillFile } from "@/hooks/mutations/editor";
import { api } from "@/lib/api";
import { EDITOR_DRAFT_SAVE_MS } from "@/lib/constants";
import { locationKey } from "@/lib/skill-location";

export type SaveOutcome =
  | { kind: "saved"; result: SaveSkillFileResult }
  | { kind: "conflict"; disk: SkillFile | null }
  | { kind: "failed"; error: unknown };

export interface SaveOptions {
  overwrite?: boolean;
  /** Project copies: also give identical copies the change. */
  otherCopies?: OtherCopiesMode;
}

export interface EditorSession {
  sessions: Readonly<Record<string, FileSession>>;
  /** A version of `file` was read from disk. */
  sync(file: SkillFile): void;
  setDraft(path: string, draft: string): void;
  save(path: string, options?: SaveOptions): Promise<SaveOutcome>;
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
export function useEditorSession(location: SkillLocation): EditorSession {
  // Drafts are stored per place, so a project copy never picks up the library's draft.
  const draftKey = locationKey(location);
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
          : openSession(file, readDraft(draftKey, file.path));
        return next === session ? previous : { ...previous, [file.path]: next };
      });
    },
    [draftKey],
  );

  const save = useCallback(
    async (path: string, options: SaveOptions = {}): Promise<SaveOutcome> => {
      const session = latest.current[path];
      if (!session) return { kind: "failed", error: new Error(`${path} is not open`) };
      const content = session.draft;
      setSaving((previous) => new Set(previous).add(path));
      try {
        const result = await mutateAsync({
          location,
          input: {
            path,
            content,
            baseHash: session.baseHash,
            overwrite: options.overwrite,
            otherCopies: options.otherCopies,
          },
        });
        // The stored draft goes with the next mirror pass once nothing is left unsaved.
        update(path, (current) => afterSave(current, result.file));
        return { kind: "saved", result };
      } catch (error) {
        if (error instanceof ApiError && error.code === "CHANGED_ON_DISK") {
          const disk = await api.editor.readFile(location, path).catch(() => null);
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
    [location, mutateAsync, update],
  );

  // Mirror unsaved drafts to localStorage after a short pause, and at once when the page goes.
  useEffect(() => {
    const flush = (): void => {
      for (const session of Object.values(sessions)) {
        if (isDirty(session)) {
          writeDraft(draftKey, session.path, {
            baseHash: session.baseHash,
            content: session.draft,
            savedAt: Date.now(),
          });
        } else {
          clearDraft(draftKey, session.path);
        }
      }
    };
    const timer = window.setTimeout(flush, EDITOR_DRAFT_SAVE_MS);
    window.addEventListener("pagehide", flush);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pagehide", flush);
    };
  }, [sessions, draftKey]);

  // Leaving the page (or switching skill) writes whatever is still unsaved right away.
  useEffect(
    () => () => {
      if (discarded.current) return;
      for (const session of Object.values(latest.current)) {
        if (!isDirty(session)) continue;
        writeDraft(draftKey, session.path, {
          baseHash: session.baseHash,
          content: session.draft,
          savedAt: Date.now(),
        });
      }
    },
    [draftKey],
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
      clearDraft(draftKey, path);
    },
    keepMine: (path) => update(path, keepMine),
    replaceDraft: (path, content) => update(path, (session) => withDraft(session, content)),
    discardAll: () => {
      discarded.current = true;
      for (const path of Object.keys(latest.current)) clearDraft(draftKey, path);
      setSessions((previous) =>
        Object.fromEntries(
          Object.entries(previous).map(([path, session]) => [path, revertToDisk(session)]),
        ),
      );
    },
    dirtyPaths,
  };
}
