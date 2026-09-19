import type { GitPreview, InstallSelection } from "@skillboard/shared";
import { GitBranch, KeyRound, PackageSearch } from "lucide-react";
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/EmptyState";
import { ProgressPanel } from "@/components/ProgressPanel";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { GIT_URL_EXAMPLES } from "@/features/install/constants";
import { GitPreviewDialog } from "@/features/install/GitPreviewDialog";
import { installPhaseText, installProgressPercent } from "@/features/install/install-tasks";
import { useInstallTask } from "@/features/install/use-install-task";
import { useCancelPreview, useConfirmGit, usePreviewGit } from "@/hooks/mutations/install";

/** Install from a Git repository: clone, look at what is inside, pick and rename, import. */
export function GitTab(): ReactNode {
  const { t } = useTranslation();
  const previewGit = usePreviewGit();
  const confirmGit = useConfirmGit();
  const cancelPreview = useCancelPreview();
  const { task, cancel } = useInstallTask();

  const [url, setUrl] = useState("");
  /** The URL last sent, which is also the key its progress is reported under. */
  const [activeUrl, setActiveUrl] = useState<string | null>(null);
  const [preview, setPreview] = useState<GitPreview | null>(null);
  const [emptyRepo, setEmptyRepo] = useState<string | null>(null);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const running = activeUrl ? task(activeUrl) : undefined;

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    const repoUrl = url.trim();
    if (!repoUrl || running) return;
    setEmptyRepo(null);
    setActiveUrl(repoUrl);
    const result = await previewGit(repoUrl);
    if (!result) return;
    // Nobody is left to choose from a preview that arrives after the page was left, and an empty
    // one has nothing to choose: both checkouts are thrown away at once.
    if (!mounted.current || result.skills.length === 0) {
      cancelPreview.mutate(result.previewId);
      if (mounted.current) setEmptyRepo(result.repoUrl);
      return;
    }
    setPreview(result);
  };

  const dismiss = (dismissed: GitPreview): void => {
    cancelPreview.mutate(dismissed.previewId);
    setPreview(null);
  };

  const confirm = async (confirmed: GitPreview, items: InstallSelection[]): Promise<void> => {
    // Confirming consumes the checkout whether or not it works, so the dialog closes right away.
    setPreview(null);
    const installed = await confirmGit(confirmed, items);
    if (installed && mounted.current) setUrl("");
  };

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-3">
        <Field>
          <FieldLabel htmlFor="install-git-url">{t("install.git.urlLabel")}</FieldLabel>
          <div className="flex items-center gap-2">
            <InputGroup className="h-9 flex-1">
              <InputGroupAddon>
                <GitBranch />
              </InputGroupAddon>
              <InputGroupInput
                id="install-git-url"
                value={url}
                spellCheck={false}
                autoComplete="off"
                className="font-mono text-sm"
                placeholder={GIT_URL_EXAMPLES[0]}
                onChange={(event) => setUrl(event.target.value)}
              />
            </InputGroup>
            <Button type="submit" disabled={!url.trim() || Boolean(running)}>
              <PackageSearch />
              {t("install.git.preview")}
            </Button>
          </div>
          <FieldDescription>{t("install.git.urlHint")}</FieldDescription>
        </Field>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">{t("install.git.examples")}</span>
          {GIT_URL_EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => setUrl(example)}
              className="rounded-md border bg-muted/50 px-1.5 py-0.5 font-mono text-xs text-muted-foreground transition-colors duration-150 hover:border-primary/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {example}
            </button>
          ))}
        </div>
      </form>

      {running ? (
        <ProgressPanel
          title={running.title}
          detail={
            running.cancelling ? t("install.toast.cancelling") : installPhaseText(running.progress)
          }
          percent={installProgressPercent(running.progress)}
          cancelling={running.cancelling}
          onCancel={running.cancellable ? () => cancel(running.key) : undefined}
        />
      ) : null}

      {emptyRepo && !running ? (
        <EmptyState
          icon={PackageSearch}
          title={t("install.git.emptyTitle")}
          description={t("install.git.emptyDescription")}
          className="rounded-lg border border-dashed"
        >
          <span className="max-w-full truncate font-mono text-xs text-muted-foreground">
            {emptyRepo}
          </span>
        </EmptyState>
      ) : null}

      <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-3">
        <KeyRound className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="flex flex-col gap-0.5">
          <p className="text-sm font-medium">{t("install.git.privateTitle")}</p>
          <p className="text-xs leading-5 text-muted-foreground">
            {t("install.git.privateDescription")}
          </p>
        </div>
      </div>

      <GitPreviewDialog
        preview={preview}
        onDismiss={dismiss}
        onConfirm={(confirmed, items) => void confirm(confirmed, items)}
      />
    </div>
  );
}
