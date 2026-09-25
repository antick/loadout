import type {
  ConfirmOptions,
  GitPreview,
  InstallSelection,
  RepoSkillPreview,
} from "@loadout/shared";
import { Bot, GitBranch, GitCommitHorizontal, RefreshCw, SearchX, ShieldAlert } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { SOURCE_KIND_ICONS } from "@/features/install/source-guess";
import { useAgents } from "@/hooks/queries/agents";
import { cn } from "@/lib/utils";

/** Characters of a commit id shown in the header. */
const REVISION_SHORT_LENGTH = 7;

export interface GitPreviewDialogProps {
  /** The cloned repository to choose from; null keeps the dialog closed. */
  preview: GitPreview | null;
  /** Closed without importing: the caller discards the checkout. */
  onDismiss: (preview: GitPreview) => void;
  onConfirm: (preview: GitPreview, items: InstallSelection[], options: ConfirmOptions) => void;
}

interface PreviewRowProps {
  skill: RepoSkillPreview;
  checked: boolean;
  name: string;
  onToggle: () => void;
  onRename: (name: string) => void;
}

function PreviewRow({ skill, checked, name, onToggle, onRename }: PreviewRowProps): ReactNode {
  const { t } = useTranslation();
  return (
    <li
      data-checked={checked}
      className="flex gap-3 rounded-md border bg-card p-3 transition-colors duration-150 data-[checked=true]:border-primary/40 data-[checked=true]:bg-primary/5"
    >
      <Checkbox
        checked={checked}
        aria-label={t("selection.selectItem", { name: skill.name })}
        className="mt-1.5"
        onCheckedChange={onToggle}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Input
          value={name}
          disabled={!checked}
          aria-label={t("install.git.nameFor", { name: skill.name })}
          placeholder={skill.name}
          className="h-7 px-2 text-sm font-medium"
          onChange={(event) => onRename(event.target.value)}
        />
        <p className="truncate font-mono text-xs text-muted-foreground" title={skill.relPath}>
          {skill.relPath}
        </p>
        <p className={cn("line-clamp-2 text-xs text-muted-foreground", !checked && "opacity-70")}>
          {skill.description ?? t("skills.noDescription")}
        </p>
        {skill.alreadyInstalled ? (
          <p className="flex items-center gap-1.5 text-xs text-info">
            <RefreshCw className="size-3 shrink-0" />
            {t("install.git.alreadyInstalled")}
          </p>
        ) : null}
      </div>
    </li>
  );
}

/** What a pasted `skills add … -a` command asked for, and which of its agents are unknown here. */
function RequestedAgentsNotice({ preview }: { preview: GitPreview }): ReactNode {
  const { t } = useTranslation();
  const agents = useAgents();
  const { unknownAgents, allAgents } = preview;
  if (!allAgents && preview.agents.length === 0 && unknownAgents.length === 0) return null;
  const names = preview.agents.map(
    (key) => agents.data?.find((agent) => agent.key === key)?.displayName ?? key,
  );
  return (
    <InlineNotice tone="info" icon={Bot}>
      {allAgents || names.length > 0 ? (
        <p>
          {allAgents
            ? t("install.git.agentsAll")
            : t("install.git.agentsNamed", { names: names.join(", ") })}
        </p>
      ) : null}
      {unknownAgents.length > 0 ? (
        <p className="text-muted-foreground">
          {t("install.git.agentsUnknown", {
            count: unknownAgents.length,
            names: unknownAgents.join(", "),
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
  const [checked, setChecked] = useState<ReadonlySet<string>>(
    () => new Set(preview.selected ?? preview.skills.map((skill) => skill.relPath)),
  );
  const [names, setNames] = useState<Record<string, string>>({});

  const allChecked = checked.size === preview.skills.length;

  const toggle = (relPath: string): void => {
    setChecked((previous) => {
      const next = new Set(previous);
      if (!next.delete(relPath)) next.add(relPath);
      return next;
    });
  };

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    const items = preview.skills
      .filter((skill) => checked.has(skill.relPath))
      // A cleared name falls back to the repository's own name.
      .map((skill) => ({
        relPath: skill.relPath,
        name: (names[skill.relPath] ?? skill.name).trim() || skill.name,
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
                {preview.revision.slice(0, REVISION_SHORT_LENGTH)}
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
            names: preview.missing.join(", "),
          })}
        </InlineNotice>
      ) : null}

      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{t("install.git.previewHint")}</p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() =>
            setChecked(allChecked ? new Set() : new Set(preview.skills.map((s) => s.relPath)))
          }
        >
          {t(allChecked ? "selection.selectNone" : "selection.selectAll")}
        </Button>
      </div>

      <ul className="-mr-2 flex max-h-[50vh] flex-col gap-2 overflow-y-auto pr-2">
        {preview.skills.map((skill) => (
          <PreviewRow
            key={skill.relPath}
            skill={skill}
            checked={checked.has(skill.relPath)}
            name={names[skill.relPath] ?? skill.name}
            onToggle={() => toggle(skill.relPath)}
            onRename={(name) => setNames((previous) => ({ ...previous, [skill.relPath]: name }))}
          />
        ))}
      </ul>

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
