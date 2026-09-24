import type { BatchImportResult, GitPreview, InstallSelection } from "@loadout/shared";
import { FileArchive, FolderInput, FolderTree, PackagePlus, X } from "lucide-react";
import { type DragEvent, type FormEvent, type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { OptionCard } from "@/components/OptionCard";
import { PageSection } from "@/components/PageSection";
import { PathText } from "@/components/PathText";
import { ProgressPanel } from "@/components/ProgressPanel";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { BatchResultSummary } from "@/features/install/BatchResultSummary";
import { ARCHIVE_EXTENSIONS } from "@/features/install/constants";
import { GitPreviewDialog } from "@/features/install/GitPreviewDialog";
import { cn } from "@/lib/utils";
import { installPhaseText, installProgressPercent } from "@/features/install/install-tasks";
import { useInstallTask } from "@/features/install/use-install-task";
import {
  useCancelPreview,
  useConfirmGit,
  useImportFolder,
  useInstallFromPath,
  usePickArchive,
  usePreviewArchive,
} from "@/hooks/mutations/install";
import { usePickFolder } from "@/hooks/mutations/library";

type SourceKind = "folder" | "archive";

interface PickedSource {
  path: string;
  kind: SourceKind;
}

/** Install from this computer: one skill folder, one archive, or every skill inside a folder. */
export function LocalTab(): ReactNode {
  const { t } = useTranslation();
  const pickFolder = usePickFolder();
  const pickArchive = usePickArchive();
  const installFromPath = useInstallFromPath();
  const importFolder = useImportFolder();
  const previewArchive = usePreviewArchive();
  const confirmGit = useConfirmGit();
  const cancelPreview = useCancelPreview();
  const { task } = useInstallTask();
  /** An archive holding several skills, waiting for the user to pick from it. */
  const [archivePreview, setArchivePreview] = useState<GitPreview | null>(null);

  const [picked, setPicked] = useState<PickedSource | null>(null);
  const [name, setName] = useState("");
  const [bulk, setBulk] = useState<{ folder: string; result: BatchImportResult | null } | null>(
    null,
  );

  const [dragging, setDragging] = useState(false);

  /**
   * Take a picked or dropped source. An archive holding several skills goes straight to the
   * picker; one with a single skill (or none, which install then reports) keeps the name form.
   */
  const accept = async (source: PickedSource): Promise<void> => {
    setName("");
    if (source.kind === "archive") {
      const preview = await previewArchive.mutateAsync(source.path).catch(() => null);
      if (!preview) return;
      if (preview.skills.length > 1) {
        setPicked(null);
        setArchivePreview(preview);
        return;
      }
      cancelPreview.mutate(preview.previewId);
    }
    setPicked(source);
  };

  const dismissArchive = (dismissed: GitPreview): void => {
    cancelPreview.mutate(dismissed.previewId);
    setArchivePreview(null);
  };

  const confirmArchive = (confirmed: GitPreview, items: InstallSelection[]): void => {
    // Confirming consumes the preview whether or not it works, so the dialog closes right away.
    setArchivePreview(null);
    void confirmGit(confirmed, items);
  };

  /** A dropped archive is recognised by its extension; anything else is treated as a folder. */
  const onDrop = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (!file) return;
    const path = window.loadout.pathForFile(file);
    if (!path) return;
    const isArchive = ARCHIVE_EXTENSIONS.some((extension) =>
      path.toLowerCase().endsWith(extension),
    );
    void accept({ path, kind: isArchive ? "archive" : "folder" });
  };

  const singleTask = picked ? task(picked.path) : undefined;
  const bulkTask = bulk && !bulk.result ? task(bulk.folder) : undefined;

  const choose = async (kind: SourceKind): Promise<void> => {
    const path =
      kind === "folder"
        ? await pickFolder.mutateAsync(t("install.local.pickFolderTitle")).catch(() => null)
        : await pickArchive.mutateAsync().catch(() => null);
    if (!path) return;
    await accept({ path, kind });
  };

  const chooseBulk = async (): Promise<void> => {
    const folder = await pickFolder.mutateAsync(t("install.local.pickBulkTitle")).catch(() => null);
    if (!folder) return;
    setBulk({ folder, result: null });
    const result = await importFolder(folder);
    // A failed import was already toasted; drop the panel instead of leaving it spinning.
    setBulk(result ? { folder, result } : null);
  };

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!picked) return;
    const installed = await installFromPath(picked.path, name);
    if (installed) {
      setPicked(null);
      setName("");
    }
  };

  return (
    <div
      className={cn(
        "flex flex-col gap-6 rounded-xl transition-colors",
        dragging && "bg-primary/5 outline-2 outline-dashed outline-primary/50 outline-offset-8",
      )}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <p className="text-sm text-muted-foreground">{t("install.local.dropHint")}</p>
      <div className="grid gap-3 md:grid-cols-3">
        <OptionCard
          icon={FolderInput}
          title={t("install.local.folderTitle")}
          description={t("install.local.folderDescription")}
          hint="SKILL.md"
          busy={pickFolder.isPending && !bulk}
          onClick={() => void choose("folder")}
        />
        <OptionCard
          icon={FileArchive}
          title={t("install.local.archiveTitle")}
          description={t("install.local.archiveDescription")}
          hint={ARCHIVE_EXTENSIONS.join("  ")}
          tone="info"
          busy={pickArchive.isPending || previewArchive.isPending}
          onClick={() => void choose("archive")}
        />
        <OptionCard
          icon={FolderTree}
          title={t("install.local.bulkTitle")}
          description={t("install.local.bulkDescription")}
          tone="brass"
          disabled={Boolean(bulkTask)}
          onClick={() => void chooseBulk()}
        />
      </div>

      {picked ? (
        <PageSection title={t("install.local.readyTitle")}>
          <form
            onSubmit={(event) => void submit(event)}
            className="flex flex-col gap-4 rounded-lg border bg-card p-4"
          >
            <div className="flex items-center gap-2">
              {picked.kind === "folder" ? (
                <FolderInput className="size-4 shrink-0 text-muted-foreground" />
              ) : (
                <FileArchive className="size-4 shrink-0 text-muted-foreground" />
              )}
              <PathText path={picked.path} className="flex-1" />
            </div>
            <Field>
              <FieldLabel htmlFor="install-local-name">{t("install.local.nameLabel")}</FieldLabel>
              <Input
                id="install-local-name"
                value={name}
                className="max-w-sm"
                placeholder={t("install.local.namePlaceholder")}
                onChange={(event) => setName(event.target.value)}
              />
              <FieldDescription>{t("install.local.nameHint")}</FieldDescription>
            </Field>
            <div className="flex items-center gap-2">
              <Button type="submit" size="sm" disabled={Boolean(singleTask)}>
                <PackagePlus />
                {t("install.local.installAction")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={Boolean(singleTask)}
                onClick={() => setPicked(null)}
              >
                <X />
                {t("common.clear")}
              </Button>
            </div>
          </form>
        </PageSection>
      ) : null}

      {bulk && !bulk.result ? (
        <ProgressPanel
          title={t("install.toast.importingFolder")}
          detail={installPhaseText(bulkTask?.progress ?? null)}
          percent={installProgressPercent(bulkTask?.progress ?? null)}
        />
      ) : null}

      <GitPreviewDialog
        preview={archivePreview}
        onDismiss={dismissArchive}
        onConfirm={confirmArchive}
      />

      {bulk?.result ? (
        <BatchResultSummary
          result={bulk.result}
          subject={<PathText path={bulk.folder} />}
          onDismiss={() => setBulk(null)}
        />
      ) : null}
    </div>
  );
}
