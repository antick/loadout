import { ApiError, formatRelative, type Skill, type SkillFileEntry } from "@loadout/shared";
import { useNavigate } from "@tanstack/react-router";
import { FileX } from "lucide-react";
import { type ReactNode, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { PageHeader } from "@/components/layout/PageHeader";
import { MarkdownView } from "@/components/MarkdownView";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CodeEditor,
  type CodeEditorHandle,
  type CursorPosition,
} from "@/features/editor/CodeEditor";
import { languageFor } from "@/features/editor/code-languages";
import { ConflictDialog } from "@/features/editor/ConflictDialog";
import { draftPaths } from "@/features/editor/editor-drafts";
import { EditorActions } from "@/features/editor/EditorActions";
import { EditorFileList } from "@/features/editor/EditorFileList";
import { EditorNotices } from "@/features/editor/EditorNotices";
import { hasDiskChange, isDirty } from "@/features/editor/editor-session";
import { EditorStatusBar, type SaveState } from "@/features/editor/EditorStatusBar";
import { frontmatterProblems } from "@/features/editor/frontmatter-checks";
import { LeaveEditorDialog } from "@/features/editor/LeaveEditorDialog";
import { useEditorSession } from "@/features/editor/use-editor-session";
import { useLeaveGuard } from "@/features/editor/use-leave-guard";
import { useSaveReport } from "@/features/editor/use-save-report";
import { useSkillFile, useSkillFiles } from "@/hooks/queries/skill-files";
import { useHotkey } from "@/hooks/use-hotkey";
import { usePersistedState } from "@/hooks/use-persisted-state";
import { api } from "@/lib/api";
import { DEFAULT_EDITOR_VIEW, EDITOR_VIEWS, type EditorView, STORAGE_KEYS } from "@/lib/constants";
import { SHORTCUT_KEYS } from "@/lib/shortcuts";
import { hasTrackedSource } from "@/lib/skill-source";
import { toastError } from "@/lib/toast";
import { cn } from "@/lib/utils";

export interface EditorWorkspaceProps {
  skill: Skill;
  /** File asked for in the address; falls back to the main document. */
  requestedPath: string | null;
  onOpenFile(path: string): void;
}

interface Conflict {
  path: string;
  mine: string;
  disk: string | null;
}

function pickPath(files: readonly SkillFileEntry[], requested: string | null): string | null {
  const editable = files.filter((file) => file.locked === null);
  const asked = requested ? editable.find((file) => file.path === requested) : undefined;
  return (asked ?? editable.find((file) => file.main) ?? editable[0])?.path ?? null;
}

/** The editor of one library skill: its files, the text, a preview, and everything around saving. */
export function EditorWorkspace({
  skill,
  requestedPath,
  onOpenFile,
}: EditorWorkspaceProps): ReactNode {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const files = useSkillFiles(skill.id);
  const activePath = files.data ? pickPath(files.data, requestedPath) : null;
  const file = useSkillFile(skill.id, activePath);
  const session = useEditorSession(skill.id);
  const report = useSaveReport();
  const editorRef = useRef<CodeEditorHandle>(null);

  const [storedView, setView] = usePersistedState<EditorView>(
    STORAGE_KEYS.editorView,
    DEFAULT_EDITOR_VIEW,
  );
  const [wrap, setWrap] = usePersistedState(STORAGE_KEYS.editorWrap, true);
  const [filesOpen, setFilesOpen] = usePersistedState(STORAGE_KEYS.editorFilesOpen, true);
  const [cursor, setCursor] = useState<CursorPosition | null>(null);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [resolving, setResolving] = useState(false);
  const [storedDrafts] = useState(() => new Set(draftPaths(skill.id)));

  const { sync } = session;
  useEffect(() => {
    if (file.data) sync(file.data);
  }, [file.data, sync]);

  const current = activePath ? session.sessions[activePath] : undefined;
  const language = languageFor(activePath ?? "");
  const view = language.previewable && EDITOR_VIEWS.includes(storedView) ? storedView : "edit";
  const draft = current?.draft ?? "";
  const previewText = useDeferredValue(draft);
  const deleted = file.error instanceof ApiError && file.error.code === "NOT_FOUND";
  const dirty = current ? isDirty(current) : false;
  const saving = activePath ? session.saving.has(activePath) : false;
  const saveState: SaveState = saving ? "saving" : dirty ? "unsaved" : "saved";
  const main = files.data?.find((entry) => entry.main) ?? null;
  const problems = useMemo(
    () => (activePath && activePath === main?.path ? frontmatterProblems(previewText) : []),
    [activePath, main?.path, previewText],
  );

  const unsaved = useMemo(() => {
    const paths = new Set(session.dirtyPaths);
    // Drafts from an earlier session count until their file is opened and settled.
    for (const path of storedDrafts) if (!session.sessions[path]) paths.add(path);
    return paths;
  }, [session.dirtyPaths, session.sessions, storedDrafts]);

  async function save(path: string, overwrite = false): Promise<boolean> {
    const mine = session.sessions[path]?.draft ?? "";
    const outcome = await session.save(path, { overwrite });
    if (outcome.kind === "saved") {
      report(outcome.result);
      return true;
    }
    if (outcome.kind === "conflict") {
      if (path !== activePath) onOpenFile(path);
      setConflict({ path, mine, disk: outcome.disk?.content ?? null });
    } else {
      toastError(outcome.error, "editor.errors.save");
    }
    return false;
  }

  const saveActive = (): void => {
    if (!activePath || !current || saving) return;
    if (!isDirty(current)) return;
    void save(activePath);
  };

  const leave = useLeaveGuard({
    dirtyPaths: session.dirtyPaths,
    saveAll: async () => {
      for (const path of session.dirtyPaths) {
        if (!(await save(path))) return false;
      }
      return true;
    },
    discardAll: session.discardAll,
  });

  // ⌘S anywhere on the page; inside the editor CodeMirror handles it and marks the event.
  useHotkey(SHORTCUT_KEYS.save, (event) => {
    if (event.defaultPrevented) return;
    event.preventDefault();
    saveActive();
  });

  const resolveConflict = async (action: "overwrite" | "disk"): Promise<void> => {
    if (!conflict) return;
    if (action === "disk") {
      session.revert(conflict.path);
      setConflict(null);
      return;
    }
    setResolving(true);
    session.keepMine(conflict.path);
    const saved = await save(conflict.path, true);
    setResolving(false);
    if (saved) setConflict(null);
  };

  const pickVersion = async (versionId: string, savedAt: number): Promise<void> => {
    if (!activePath) return;
    try {
      const content = await api.skills.readFileVersion(skill.id, activePath, versionId);
      session.replaceDraft(activePath, content);
      editorRef.current?.focus();
      toast.info(t("editor.versions.loaded", { when: formatRelative(savedAt) }));
    } catch (error) {
      toastError(error, "editor.versions.failed");
    }
  };

  const header = (
    <PageHeader
      title={skill.name}
      subtitle={activePath ?? undefined}
      breadcrumbs={[{ label: t("nav.library"), to: "/library" }]}
      actions={
        <EditorActions
          skillId={skill.id}
          path={activePath}
          view={view}
          previewable={language.previewable}
          onView={setView}
          canSave={dirty && !saving}
          saving={saving}
          onSave={saveActive}
          onPickVersion={(id, at) => void pickVersion(id, at)}
          onDone={() => void navigate({ to: "/library", search: { skill: skill.id } })}
        />
      }
    />
  );

  if (files.isError) {
    return (
      <>
        {header}
        <ErrorState error={files.error} onRetry={() => void files.refetch()} className="h-full" />
      </>
    );
  }
  if (files.data && !activePath) {
    return (
      <>
        {header}
        <EmptyState
          icon={FileX}
          title={t("editor.empty.title")}
          description={t("editor.empty.description")}
          className="h-full"
        />
      </>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      {header}
      {filesOpen ? (
        <aside className="w-52 shrink-0 overflow-y-auto border-r bg-sidebar/40">
          {files.data ? (
            <EditorFileList
              files={files.data}
              activePath={activePath}
              unsaved={unsaved}
              showEdited={hasTrackedSource(skill)}
              onSelect={onOpenFile}
            />
          ) : (
            <div className="flex flex-col gap-2 p-3">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-4/5" />
              <Skeleton className="h-6 w-3/5" />
            </div>
          )}
        </aside>
      ) : null}

      <section className="flex min-w-0 flex-1 flex-col">
        {activePath && (current || deleted) ? (
          <EditorNotices
            skill={skill}
            path={activePath}
            deleted={deleted}
            diskChanged={current ? hasDiskChange(current) : false}
            restored={current?.restored ?? false}
            problems={problems}
            onCompare={() =>
              current &&
              setConflict({ path: current.path, mine: current.draft, disk: current.disk.content })
            }
            onKeepMine={() => activePath && session.keepMine(activePath)}
            onReload={() => activePath && session.revert(activePath)}
            onDiscardRestored={() => activePath && session.revert(activePath)}
          />
        ) : null}

        {/* A narrow editor stacks the preview underneath instead of squeezing both. */}
        <div className="@container flex min-h-0 flex-1">
          <div className="flex min-h-0 min-w-0 flex-1 @max-2xl:flex-col">
            {file.isError && !deleted ? (
              <ErrorState
                error={file.error}
                onRetry={() => void file.refetch()}
                className="flex-1"
              />
            ) : !current ? (
              <div className="flex flex-1 flex-col gap-2 p-4">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-4 w-3/5" />
              </div>
            ) : (
              <>
                {/* Kept mounted in preview mode so every file keeps its undo history. */}
                <div className={cn("min-h-0 min-w-0 flex-1", view === "preview" && "hidden")}>
                  <CodeEditor
                    ref={editorRef}
                    docKey={current.path}
                    value={current.draft}
                    language={language}
                    wrap={wrap}
                    ariaLabel={t("editor.ariaLabel", { path: current.path })}
                    onChange={(text) => session.setDraft(current.path, text)}
                    onSave={saveActive}
                    onCursor={setCursor}
                  />
                </div>
                {view !== "edit" ? (
                  <div
                    className={cn(
                      "min-h-0 min-w-0 flex-1 overflow-y-auto bg-background px-6 py-5",
                      view === "split" && "border-l @max-2xl:border-t @max-2xl:border-l-0",
                    )}
                  >
                    <MarkdownView content={previewText} />
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>

        <EditorStatusBar
          cursor={current ? cursor : null}
          languageLabel={current ? language.label : null}
          eol={current?.disk.eol ?? null}
          state={saveState}
          wrap={wrap}
          onToggleWrap={() => setWrap((on) => !on)}
          filesOpen={filesOpen}
          onToggleFiles={() => setFilesOpen((open) => !open)}
        />
      </section>

      <ConflictDialog
        conflict={conflict}
        busy={resolving}
        onOverwrite={() => void resolveConflict("overwrite")}
        onUseDisk={() => void resolveConflict("disk")}
        onCancel={() => setConflict(null)}
      />
      <LeaveEditorDialog
        open={leave.blocked}
        paths={session.dirtyPaths}
        busy={leave.busy}
        onSave={leave.saveAndLeave}
        onDiscard={leave.discardAndLeave}
        onStay={leave.stay}
      />
    </div>
  );
}
