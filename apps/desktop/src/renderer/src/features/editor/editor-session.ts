import type { SkillFile } from "@loadout/shared";
import type { EditorDraft } from "@/features/editor/editor-drafts";

/**
 * The state of one open file, as plain data and pure transitions. Three texts matter:
 * - `baseContent` / `baseHash`: the version the edit is based on; the next save sends that hash,
 *   so a change made on disk meanwhile is refused instead of overwritten;
 * - `draft`: what is in the editor;
 * - `disk`: the newest version seen on disk.
 */
export interface FileSession {
  path: string;
  baseHash: string;
  baseContent: string;
  draft: string;
  disk: SkillFile;
  /** The draft came back from an earlier session. */
  restored: boolean;
}

export function isDirty(session: FileSession): boolean {
  return session.draft !== session.baseContent;
}

/** The file moved on under an edit, and the two now disagree. */
export function hasDiskChange(session: FileSession): boolean {
  return session.disk.hash !== session.baseHash && session.disk.content !== session.draft;
}

/** Open a file, bringing back an unsaved draft of it when there is one. */
export function openSession(file: SkillFile, draft: EditorDraft | null): FileSession {
  const fresh: FileSession = {
    path: file.path,
    baseHash: file.hash,
    baseContent: file.content,
    draft: file.content,
    disk: file,
    restored: false,
  };
  if (!draft || draft.content === file.content) return fresh;
  // The draft keeps the hash it started from: if the file changed since, saving asks first.
  return { ...fresh, baseHash: draft.baseHash, draft: draft.content, restored: true };
}

/** A version of the file was read from disk. Unchanged text follows it; an edit never does. */
export function applyDiskVersion(session: FileSession, file: SkillFile): FileSession {
  if (file.hash === session.disk.hash) return session;
  const follow = { baseHash: file.hash, baseContent: file.content, disk: file };
  if (!isDirty(session)) return { ...session, ...follow, draft: file.content };
  // Someone wrote exactly what is in the editor (or this was our own save): nothing to resolve.
  if (file.content === session.draft) return { ...session, ...follow, restored: false };
  return { ...session, disk: file };
}

/** The save of `sent` went through; typing that happened meanwhile stays unsaved. */
export function afterSave(session: FileSession, saved: SkillFile): FileSession {
  return {
    ...session,
    baseHash: saved.hash,
    baseContent: saved.content,
    disk: saved,
    restored: false,
  };
}

/** Throw the edit away and show what is on disk now. */
export function revertToDisk(session: FileSession): FileSession {
  return {
    ...session,
    baseHash: session.disk.hash,
    baseContent: session.disk.content,
    draft: session.disk.content,
    restored: false,
  };
}

/** Keep the edit and base it on the newest disk version, so the next save overwrites that. */
export function keepMine(session: FileSession): FileSession {
  return { ...session, baseHash: session.disk.hash, baseContent: session.disk.content };
}

export function withDraft(session: FileSession, draft: string): FileSession {
  return draft === session.draft ? session : { ...session, draft };
}
