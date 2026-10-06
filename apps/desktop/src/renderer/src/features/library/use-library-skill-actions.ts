import { hasTrackedSource } from "@loadout/shared";
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
  // The mutations' `mutate` functions, not the mutation objects: those change on every state
  // change, and the actions must stay the same function, or every card would draw again.
  const { mutate: reveal } = useRevealSkill();
  const { mutate: check } = useCheckSkillUpdate();
  const { mutate: exportSkills } = useExportSkills();
  const deleteSkills = useDeleteSkills();
  const { mutate: setFavorite } = useSetFavorite();
  const { mutate: openInEditor } = useOpenInEditor();
  const { id: editorId, label: editorLabel } = useDefaultEditor();
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
          run: () => reveal(skill.id),
        },
        {
          id: "open",
          label: editorLabel,
          icon: editorId === "system" ? AppWindow : CodeXml,
          run: () => openInEditor({ editor: editorId, path: skill.libraryPath }),
        },
        {
          id: "favorite",
          label: t(
            skill.favoritedAt === null ? "library.favorites.add" : "library.favorites.remove",
            { name: skill.name },
          ),
          icon: skill.favoritedAt === null ? Star : StarOff,
          run: () => setFavorite({ skillId: skill.id, favorite: skill.favoritedAt === null }),
        },
      ];
      actions.push({
        id: "export",
        label: t("library.export.action"),
        icon: FileArchive,
        run: () => exportSkills([skill]),
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
          run: () => check(skill.id),
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
      editorId,
      editorLabel,
      shell,
    ],
  );
}
