import type { Skill } from "@loadout/shared";
import { useNavigate } from "@tanstack/react-router";
import {
  AppWindow,
  CodeXml,
  FileArchive,
  FolderOpen,
  Package,
  PencilLine,
  RefreshCw,
  Star,
  StarOff,
  TextCursorInput,
  Trash2,
} from "lucide-react";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useShell } from "@/components/layout/shell-context";
import type { SkillAction } from "@/components/skill-action";
import {
  useCheckSkillUpdate,
  useExportSkills,
  useRevealSkill,
} from "@/features/library/library-mutations";
import { useDeleteSkills } from "@/hooks/mutations/library";
import { useOpenInEditor } from "@/hooks/mutations/app";
import { useSetFavorite } from "@/hooks/mutations/skills";
import { useDefaultEditor } from "@/hooks/use-default-editor";
import { hasTrackedSource } from "@/lib/skill-source";
import { editLink } from "@/lib/skill-location";

export interface LibrarySkillActionsOptions {
  /** Runs instead of the confirm-and-delete, where the caller deletes in its own way. */
  onDelete?: (skill: Skill) => void;
}

/** What a library skill's right-click menu offers. */
export function useLibrarySkillActions({ onDelete }: LibrarySkillActionsOptions = {}): (
  skill: Skill,
) => SkillAction[] {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const reveal = useRevealSkill();
  const check = useCheckSkillUpdate();
  const exportSkills = useExportSkills();
  const deleteSkills = useDeleteSkills();
  const setFavorite = useSetFavorite();
  const openInEditor = useOpenInEditor();
  const editor = useDefaultEditor();
  const shell = useShell();

  return useCallback(
    (skill: Skill): SkillAction[] => {
      const actions: SkillAction[] = [
        {
          id: "edit",
          label: t("editor.open"),
          icon: PencilLine,
          run: () => void navigate(editLink({ kind: "library", skillId: skill.id })),
        },
        {
          id: "rename",
          label: t("library.rename.action"),
          icon: TextCursorInput,
          run: () => shell.openRenameSkill(skill),
        },
        {
          id: "reveal",
          label: t("library.detail.reveal"),
          icon: FolderOpen,
          run: () => reveal.mutate(skill.id),
        },
        {
          id: "open",
          label: editor.label,
          icon: editor.id === "system" ? AppWindow : CodeXml,
          run: () => openInEditor.mutate({ editor: editor.id, path: skill.libraryPath }),
        },
        {
          id: "favorite",
          label: t(
            skill.favoritedAt === null ? "library.favorites.add" : "library.favorites.remove",
            { name: skill.name },
          ),
          icon: skill.favoritedAt === null ? Star : StarOff,
          run: () =>
            setFavorite.mutate({ skillId: skill.id, favorite: skill.favoritedAt === null }),
        },
      ];
      actions.push({
        id: "export",
        label: t("library.export.action"),
        icon: FileArchive,
        run: () => exportSkills.mutate([skill]),
      });
      actions.push({
        id: "clawhub",
        label: t("publish.clawhub.action"),
        icon: Package,
        run: () => shell.openPublishToClawhub(skill),
      });
      if (hasTrackedSource(skill)) {
        actions.push({
          id: "check",
          label: t("library.source.checkNow"),
          icon: RefreshCw,
          run: () => check.mutate(skill.id),
        });
      }
      actions.push({
        id: "delete",
        label: t("library.detail.delete"),
        icon: Trash2,
        destructive: true,
        run: () => (onDelete ? onDelete(skill) : void deleteSkills([skill])),
      });
      return actions;
    },
    [
      t,
      navigate,
      reveal,
      check,
      exportSkills,
      deleteSkills,
      onDelete,
      setFavorite,
      openInEditor,
      editor,
      shell,
    ],
  );
}
