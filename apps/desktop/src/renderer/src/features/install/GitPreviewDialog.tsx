import {
  type ConfirmOptions,
  formatRevision,
  type GitPreview,
  type InstallOutcome,
  type InstallSelection,
  initialSelection,
  planInstallNames,
  formatNameList,
} from "@loadout/shared";
import { Bot, GitBranch, GitCommitHorizontal, SearchX, ShieldAlert } from "lucide-react";
import { type FormEvent, type ReactNode, type RefObject, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { InlineNotice } from "@/components/InlineNotice";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PreviewSkillList } from "@/features/install/PreviewSkillList";
import { SOURCE_KIND_ICONS } from "@/features/install/source-guess";
import { useAgentNames } from "@/hooks/queries/agents";
import { setMany } from "@/lib/sets";

export interface GitPreviewDialogProps {
  /** The cloned repository to choose from; null keeps the dialog closed. */
  preview: GitPreview | null;
  /** Closed without importing: the caller discards the checkout. */
  onDismiss: (preview: GitPreview) => void;
  onConfirm: (preview: GitPreview, items: InstallSelection[], options: ConfirmOptions) => void;
}

/** What a pasted `skills add … -a` command asked for, and which of its agents are unknown here. */
function RequestedAgentsNotice({ preview }: { preview: GitPreview }): ReactNode {
  const { t } = useTranslation();
  const agentNames = useAgentNames();
  const { unknownAgents, allAgents } = preview;
  if (!allAgents && preview.agents.length === 0 && unknownAgents.length === 0) return null;
  const names = preview.agents.map((key) => agentNames.get(key) ?? key);
  return (
    <InlineNotice tone="info" icon={Bot}>
      {allAgents || names.length > 0 ? (
        <p>
          {allAgents
            ? t("install.git.agentsAll")
            : t("install.git.agentsNamed", { names: formatNameList(names) })}
        </p>
      ) : null}
      {unknownAgents.length > 0 ? (
        <p className="text-muted-foreground">
          {t("install.git.agentsUnknown", {
            count: unknownAgents.length,
            names: formatNameList(unknownAgents),
          })}
        </p>
      ) : null}
    </InlineNotice>
  );
}

/**
 * Own component so each preview starts fresh: the skills the typed text named ticked (or all of
 * them when it named none), and the names from the repository.
 */
function PreviewForm({
  preview,
  submitRef,
  onDismiss,
  onConfirm,
}: {
  preview: GitPreview;
  submitRef: RefObject<HTMLButtonElement | null>;
  onDismiss: () => void;
  onConfirm: (items: InstallSelection[], options: ConfirmOptions) => void;
}): ReactNode {
  const { t } = useTranslation();
  const [trusted, setTrusted] = useState(false);
  const needsTrust = preview.redirectedTo !== null && !trusted;
  const KindIcon = SOURCE_KIND_ICONS[preview.kind];
  const [names, setNames] = useState<Record<string, string>>({});
  // A cleared name falls back to the source's own name.
  const nameOf = (relPath: string, fallback: string): string =>
    (names[relPath] ?? fallback).trim() || fallback;
  const [checked, setChecked] = useState<ReadonlySet<string>>(() =>
    initialSelection(
      preview,
      planInstallNames(
        preview.skills.map((skill) => skill.name),
        preview.library,
      ),
    ),
  );
  const [replacing, setReplacing] = useState<ReadonlySet<string>>(new Set());
  // Worked out again on every tick and rename: an unticked row takes no name from the rows after it.
  const planned = planInstallNames(
    preview.skills.map((skill) => nameOf(skill.relPath, skill.name)),
    preview.library,
    preview.skills.map((skill) => checked.has(skill.relPath)),
    preview.skills.map((skill) => replacing.has(skill.relPath)),
  );
  const outcomes = new Map<string, InstallOutcome>(
    preview.skills.flatMap((skill, index) => {
      const outcome = planned[index];
      return outcome ? [[skill.relPath, outcome] as const] : [];
    }),
  );

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    const items = preview.skills
      .filter((skill) => checked.has(skill.relPath))
      .map((skill) => ({
        relPath: skill.relPath,
        name: nameOf(skill.relPath, skill.name),
        // Only rows the plan says replace: a rename may have freed the name since it was ticked.
        replace: outcomes.get(skill.relPath)?.kind === "replaces",
      }));
    if (items.length > 0 && !needsTrust) {
      onConfirm(items, { acceptRedirect: preview.redirectedTo !== null && trusted });
    }
  };

  return (
    <form onSubmit={submit} className="contents">
      <DialogHeader>
        <DialogTitle>{t("install.git.previewTitle", { count: preview.skills.length })}</DialogTitle>
        <DialogDescription asChild>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span className="flex min-w-0 items-center gap-1 font-mono text-xs" data-selectable>
              <KindIcon
                className="size-3 shrink-0"
                aria-label={t(`install.git.kind.${preview.kind}`)}
              />
              <span className="truncate" title={preview.repoUrl}>
                {preview.repoUrl}
              </span>
            </span>
            {preview.branch ? (
              <span className="flex items-center gap-1 font-mono text-xs">
                <GitBranch className="size-3" />
                {preview.branch}
              </span>
            ) : null}
            {preview.revision ? (
              <span className="flex items-center gap-1 font-mono text-xs" title={preview.revision}>
                <GitCommitHorizontal className="size-3" />
                {formatRevision(preview.revision)}
              </span>
            ) : null}
          </div>
        </DialogDescription>
      </DialogHeader>

      {preview.redirectedTo ? (
        <InlineNotice tone="warning" icon={ShieldAlert}>
          <p>{t("install.git.redirected", { host: preview.redirectedTo })}</p>
          <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm font-medium">
            <Checkbox checked={trusted} onCheckedChange={(value) => setTrusted(value === true)} />
            {t("install.git.trustHost", { host: preview.redirectedTo })}
          </label>
        </InlineNotice>
      ) : null}

      <RequestedAgentsNotice preview={preview} />

      {preview.missing.length > 0 ? (
        <InlineNotice tone="warning" icon={SearchX}>
          {t("install.git.missing", {
            count: preview.missing.length,
            names: formatNameList(preview.missing),
          })}
        </InlineNotice>
      ) : null}

      <PreviewSkillList
        skills={preview.skills}
        checked={checked}
        names={names}
        outcomes={outcomes}
        onCheckedChange={setChecked}
        onRename={(relPath, name) => setNames((previous) => ({ ...previous, [relPath]: name }))}
        replacing={replacing}
        onReplaceChange={(relPath, replace) =>
          setReplacing((previous) => setMany(previous, [relPath], replace))
        }
      />

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDismiss}>
          {t("common.cancel")}
        </Button>
        <Button ref={submitRef} type="submit" disabled={checked.size === 0 || needsTrust}>
          {t("install.git.importSelected", { count: checked.size })}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Choose which skills of a repository or archive to import, and under which names. */
export function GitPreviewDialog({
  preview,
  onDismiss,
  onConfirm,
}: GitPreviewDialogProps): ReactNode {
  const submit = useRef<HTMLButtonElement>(null);
  return (
    <Dialog
      open={preview !== null}
      onOpenChange={(open) => {
        if (!open && preview) onDismiss(preview);
      }}
    >
      <DialogContent
        className="sm:max-w-2xl"
        // Start on the main action: the first focusable element would be "Select none".
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          submit.current?.focus();
        }}
      >
        {preview ? (
          <PreviewForm
            key={preview.previewId}
            preview={preview}
            submitRef={submit}
            onDismiss={() => onDismiss(preview)}
            onConfirm={(items, options) => onConfirm(preview, items, options)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
