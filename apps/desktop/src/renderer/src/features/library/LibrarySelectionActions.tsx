import type { Skill } from "@loadout/shared";
import {
  ArrowUpCircle,
  FileArchive,
  Layers,
  Plus,
  Send,
  Share2,
  Tags,
  Trash2,
  Upload,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { BatchDeployDialog } from "@/components/BatchDeployDialog";
import { BatchTagDialog } from "@/components/BatchTagDialog";
import { useShell } from "@/components/layout/shell-context";
import { PresetIcon } from "@/components/PresetIcon";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { hasUpdate } from "@/features/library/library-filters";
import { useExportSkills } from "@/features/library/library-mutations";
import { PublishDialog } from "@/features/library/publish/PublishDialog";
import { useDeleteSkills } from "@/hooks/mutations/library";
import { useUpdateSkills } from "@/hooks/mutations/library";
import { useAddSkillsToPreset } from "@/hooks/mutations/preset-members";
import { usePresets } from "@/hooks/queries/presets";

export interface LibrarySelectionActionsProps {
  /** The selected skills, in list order. */
  skills: readonly Skill[];
  /** Leave selection mode after an action that finished the job. */
  onDone: () => void;
}

/** Buttons shown in the selection toolbar of the library, with the dialogs they open. */
export function LibrarySelectionActions({
  skills,
  onDone,
}: LibrarySelectionActionsProps): ReactNode {
  const { t } = useTranslation();
  const shell = useShell();
  const presets = usePresets();
  const addToPreset = useAddSkillsToPreset();
  const updateMany = useUpdateSkills();
  const exportSkills = useExportSkills();
  const deleteSkills = useDeleteSkills();
  const [deployOpen, setDeployOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);

  const none = skills.length === 0;
  const updatable = skills.filter(hasUpdate);

  return (
    <>
      <Button variant="outline" size="sm" disabled={none} onClick={() => setDeployOpen(true)}>
        <Send />
        {t("library.selection.deploy")}
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" disabled={none || addToPreset.isPending}>
            {addToPreset.isPending ? <Spinner /> : <Layers />}
            {t("library.selection.addToPreset")}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel>{t("library.selection.choosePreset")}</DropdownMenuLabel>
          {(presets.data ?? []).map((preset) => (
            <DropdownMenuItem
              key={preset.id}
              onSelect={() =>
                addToPreset.mutate(
                  { preset, skillIds: skills.map((skill) => skill.id) },
                  { onSuccess: onDone },
                )
              }
            >
              <PresetIcon icon={preset.icon} size="sm" />
              <span className="truncate">{preset.name}</span>
            </DropdownMenuItem>
          ))}
          {(presets.data ?? []).length > 0 ? <DropdownMenuSeparator /> : null}
          <DropdownMenuItem onSelect={() => shell.openPresetDialog()}>
            <Plus />
            {t("presets.new")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Button variant="outline" size="sm" disabled={none} onClick={() => setTagsOpen(true)}>
        <Tags />
        {t("library.selection.tags")}
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" disabled={none || exportSkills.isPending}>
            {exportSkills.isPending ? <Spinner /> : <Share2 />}
            {t("library.selection.share")}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuItem
            onSelect={() =>
              exportSkills.mutate(skills, { onSuccess: (result) => (result ? onDone() : null) })
            }
          >
            <FileArchive />
            {t("library.selection.export")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setPublishOpen(true)}>
            <Upload />
            {t("library.selection.publish")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {updatable.length > 0 ? (
        <Button
          variant="outline"
          size="sm"
          disabled={updateMany.isPending}
          onClick={() =>
            updateMany.mutate(
              updatable.map((skill) => skill.id),
              { onSuccess: onDone },
            )
          }
        >
          {updateMany.isPending ? <Spinner /> : <ArrowUpCircle />}
          {t("library.selection.update", { count: updatable.length })}
        </Button>
      ) : null}

      <Button
        variant="ghost"
        size="sm"
        disabled={none}
        className="ml-auto text-danger hover:bg-danger/10 hover:text-danger"
        onClick={() => void deleteSkills(skills).then((started) => (started ? onDone() : null))}
      >
        <Trash2 />
        {t("library.selection.delete", { count: skills.length })}
      </Button>

      <BatchDeployDialog
        open={deployOpen}
        onOpenChange={setDeployOpen}
        skills={skills}
        onDone={onDone}
      />
      <PublishDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        skills={skills}
        onDone={onDone}
      />
      <BatchTagDialog open={tagsOpen} onOpenChange={setTagsOpen} skills={skills} onDone={onDone} />
    </>
  );
}
