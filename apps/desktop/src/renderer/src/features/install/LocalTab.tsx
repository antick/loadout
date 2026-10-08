import { ARCHIVE_SUFFIXES, isArchivePath } from "@loadout/shared";
import type { BatchImportResult, GitPreview } from "@loadout/shared";
import { FileArchive, FolderInput, FolderTree, PackagePlus, X } from "lucide-react";
import { type DragEvent, type FormEvent, type ReactNode, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { OptionCard } from "@/components/OptionCard";
import { PageSection } from "@/components/PageSection";
import { PathText } from "@/components/PathText";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { BatchResultSummary } from "@/features/install/BatchResultSummary";
import { GitPreviewDialog } from "@/features/install/GitPreviewDialog";
import {
  useCancelPreview,
  useCancelPreviewOnLeave,
  useConfirmGit,
  useImportFolder,
  useInstallFromPath,
  usePickArchive,
  usePreviewArchive,
} from "@/features/install/install-mutations";
import { cn } from "@/lib/utils";
import { useInstallTasks } from "@/features/install/use-install-task";
import { usePreviewChoice } from "@/features/install/use-preview-choice";
import { usePickFolder } from "@/hooks/mutations/app";
import { useMounted } from "@/hooks/use-mounted";

type SourceKind = "folder" | "archive";

interface PickedSource {
  path: string;
  kind: SourceKind;
  /** An archive's open preview, holding its one skill: installing confirms it. */
  preview?: GitPreview;
}

/** Install from this computer: one skill folder, one archive, or every skill inside a folder. */
export function LocalTab(): ReactNode {
  const { t } = useTranslation();
  const pickFolder = usePickFolder();
  const pickArchive = usePickArchive();
  const installFromPath = useInstallFromPath();
  const confirmGit = useConfirmGit();
  const importFolder = useImportFolder();
  const previewArchive = usePreviewArchive();
  const cancelPreview = useCancelPreview();
  const { task } = useInstallTasks();
  /** An archive holding several skills, waiting for the user to pick from it. */
  const archiveChoice = usePreviewChoice();

  const [picked, setPicked] = useState<PickedSource | null>(null);
  useCancelPreviewOnLeave(picked?.preview);
  const mounted = useMounted();
  /** Counts picks, so an archive's preview that arrives after a later pick is thrown away. */
  const pickCount = useRef(0);
  const [name, setName] = useState("");
  const [bulk, setBulk] = useState<{ folder: string; result: BatchImportResult | null } | null>(
    null,
  );

  const [dragging, setDragging] = useState(false);

  /** Give up the picked source; an archive's preview is thrown away. */
  const drop = (): void => {
    if (picked?.preview) cancelPreview.mutate(picked.preview.previewId);
    setPicked(null);
  };

  /**
   * Take a picked or dropped source. An archive holding several skills goes straight to the
   * picker; one with a single skill keeps the name form.
   */
  const accept = async (source: PickedSource): Promise<void> => {
    const pick = ++pickCount.current;
    drop();
    setName("");
    if (source.kind === "folder") {
      setPicked(source);
      return;
    }
    const preview = await previewArchive.mutateAsync(source.path).catch(() => null);
    if (!preview) return;
    // The page was left, or something else was picked meanwhile: nobody wants this one.
    if (!mounted.current || pick !== pickCount.current) {
      cancelPreview.mutate(preview.previewId);
      return;
    }
    if (preview.skills.length === 0) {
      cancelPreview.mutate(preview.previewId);
      toast.error(t("install.git.empty.archive.title"), {
        description: t("install.git.empty.archive.description"),
      });
      return;
    }
    if (preview.skills.length > 1) archiveChoice.show(preview);
    else setPicked({ ...source, preview });
  };

  /** A dropped archive is recognised by its extension; anything else is treated as a folder. */
  const onDrop = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (!file) return;
    const path = window.loadout.pathForFile(file);
    if (!path) return;
    void accept({ path, kind: isArchivePath(path) ? "archive" : "folder" });
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
    const { preview } = picked;
    const installed = preview
      ? await confirmGit(
          preview,
          preview.skills.map((skill) => ({
            relPath: skill.relPath,
            name: name.trim() || skill.name,
          })),
        )
      : await installFromPath(picked.path, name);
    // Trying spends an archive's preview whether or not it installed.
    if (installed || preview) {
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
          hint={ARCHIVE_SUFFIXES.join("  ")}
          tone="info"
          busy={pickArchive.isPending || previewArchive.isPending}
          onClick={() => void choose("archive")}
        />
        <OptionCard
          icon={FolderTree}
          title={t("install.local.bulkTitle")}
          description={t("install.local.bulkDescription")}
          tone="kit"
          busy={Boolean(bulkTask)}
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
                onClick={drop}
              >
                <X />
                {t("common.clear")}
              </Button>
            </div>
          </form>
        </PageSection>
      ) : null}

      <GitPreviewDialog
        preview={archiveChoice.preview}
        onDismiss={archiveChoice.dismiss}
        onConfirm={(confirmed, items) => void archiveChoice.confirm(confirmed, items)}
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
