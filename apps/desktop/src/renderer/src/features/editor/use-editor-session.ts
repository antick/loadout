import {
  ApiError,
  type OtherCopiesMode,
  type SaveSkillFileResult,
  type SkillFile,
  type SkillLocation,
} from "@loadout/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { clearDraft, readDraft, storeDrafts } from "@/features/editor/editor-drafts";
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
import { setMany } from "@/lib/sets";

type SaveOutcome =
  | { kind: "saved"; result: SaveSkillFileResult }
  | { kind: "conflict"; disk: SkillFile | null }
  | { kind: "failed"; error: unknown };

interface SaveOptions {
  overwrite?: boolean;
  /** Project copies: also give identical copies the change. */
  otherCopies?: OtherCopiesMode;
}

type Sessions = Record<string, FileSession>;

export interface EditorSession {
  sessions: Readonly<Sessions>;
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
  /** False while unsaved text could not be kept in localStorage: closing the window loses it. */
  draftsStored: boolean;
}

/**
 * Every file opened in the editor for one skill: its draft, the version it is based on and the
 * newest version seen on disk. Drafts are mirrored to localStorage while unsaved.
 */
export function useEditorSession(location: SkillLocation): EditorSession {
  // Drafts are stored per place, so a project copy never picks up the library's draft.
  const draftKey = locationKey(location);
  // `latest` moves with every change at once, not at the next render, so a save that finishes
  // just before the page goes still settles its stored draft.
  const latest = useRef<Sessions>({});
  const [sessions, setSessions] = useState<Sessions>({});
  const [saving, setSaving] = useState<ReadonlySet<string>>(new Set());
  const [draftsStored, setDraftsStored] = useState(true);
  /** Set once the user discarded everything, so leaving does not store the drafts again. */
  const discarded = useRef(false);
  const saveFile = useSaveSkillFile();
  const { mutateAsync } = saveFile;

  const commit = useCallback((change: (previous: Sessions) => Sessions) => {
    const next = change(latest.current);
    if (next === latest.current) return;
    latest.current = next;
    setSessions(next);
  }, []);

  const update = useCallback(
    (path: string, change: (session: FileSession) => FileSession) => {
      commit((previous) => {
        const session = previous[path];
        if (!session) return previous;
        const next = change(session);
        return next === session ? previous : { ...previous, [path]: next };
      });
    },
    [commit],
  );

  const sync = useCallback(
    (file: SkillFile) => {
      commit((previous) => {
        const session = previous[file.path];
        const next = session
          ? applyDiskVersion(session, file)
          : openSession(file, readDraft(draftKey, file.path));
        return next === session ? previous : { ...previous, [file.path]: next };
      });
    },
    [commit, draftKey],
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
        update(path, (current) => afterSave(current, result.file));
        // Settle the stored draft now, not at the next mirror pass: leaving right after a save
        // would otherwise keep the old draft. Typing done meanwhile is stored on the new version.
        const saved = latest.current[path];
        if (saved && !storeDrafts(draftKey, [saved])) setDraftsStored(false);
        return { kind: "saved", result };
      } catch (error) {
        if (error instanceof ApiError && error.code === "CHANGED_ON_DISK") {
          const disk = await api.editor.readFile(location, path).catch(() => null);
          if (disk) update(path, (current) => applyDiskVersion(current, disk));
          return { kind: "conflict", disk };
        }
        return { kind: "failed", error };
      } finally {
        setSaving((previous) => setMany(previous, [path], false));
      }
    },
    [draftKey, location, mutateAsync, update],
  );

  // Mirror the drafts to localStorage after a short pause, and at once when the page goes.
  useEffect(() => {
    const flush = (): void => setDraftsStored(storeDrafts(draftKey, Object.values(sessions)));
    const timer = window.setTimeout(flush, EDITOR_DRAFT_SAVE_MS);
    window.addEventListener("pagehide", flush);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pagehide", flush);
    };
  }, [sessions, draftKey]);

  // Leaving the page (or switching skill) runs the same pass right away, which the pause above
  // would miss: unsaved files keep their drafts and saved ones lose theirs.
  useEffect(
    () => () => {
      if (!discarded.current) storeDrafts(draftKey, Object.values(latest.current));
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
      commit((previous) =>
        Object.fromEntries(
          Object.entries(previous).map(([path, session]) => [path, revertToDisk(session)]),
        ),
      );
    },
    dirtyPaths,
    draftsStored,
  };
}
