import { type EditorChoice, resolveEditor } from "@loadout/shared";
import { useTranslation } from "react-i18next";
import { useEditors } from "@/hooks/queries/app";
import { useSetting } from "@/hooks/queries/settings";

export interface DefaultEditor {
  id: EditorChoice;
  /** "Open in Cursor", or "Open in default app" for the system default. */
  label: string;
}

/** The editor the "Open in editor" buttons use: the chosen one when found, else the system's. */
export function useDefaultEditor(): DefaultEditor {
  const { t } = useTranslation();
  const setting = useSetting("defaultEditor");
  const editors = useEditors();
  const editor = resolveEditor(setting, editors.data ?? []);
  return {
    id: editor.id,
    label: editor.name
      ? t("common.openInEditor", { editor: editor.name })
      : t("common.openInDefaultApp"),
  };
}
