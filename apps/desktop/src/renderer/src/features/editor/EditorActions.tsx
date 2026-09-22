import type { SkillLocation } from "@loadout/shared";
import { Columns2, Eye, PencilLine, Save } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { VersionsMenu } from "@/features/editor/VersionsMenu";
import { useShortcutLabel } from "@/hooks/use-shortcut-label";
import { EDITOR_VIEWS, type EditorView } from "@/lib/constants";

const VIEW_ICONS = { edit: PencilLine, split: Columns2, preview: Eye } as const;

export interface EditorActionsProps {
  location: SkillLocation;
  path: string | null;
  view: EditorView;
  /** Only Markdown has a preview; other files are always shown as text. */
  previewable: boolean;
  onView(view: EditorView): void;
  canSave: boolean;
  saving: boolean;
  onSave(): void;
  onPickVersion(versionId: string, savedAt: number): void;
  onDone(): void;
}

/** The editor's buttons in the top bar: earlier versions, layout, save and done. */
export function EditorActions({
  location,
  path,
  view,
  previewable,
  onView,
  canSave,
  saving,
  onSave,
  onPickVersion,
  onDone,
}: EditorActionsProps): ReactNode {
  const { t } = useTranslation();
  const saveShortcut = useShortcutLabel("save");

  return (
    <>
      <VersionsMenu location={location} path={path} onPick={onPickVersion} />
      {previewable ? (
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          value={view}
          aria-label={t("editor.view.label")}
          onValueChange={(next) => {
            const picked = EDITOR_VIEWS.find((candidate) => candidate === next);
            if (picked) onView(picked);
          }}
        >
          {EDITOR_VIEWS.map((mode) => {
            const Icon = VIEW_ICONS[mode];
            // A title, not a Tooltip: the tooltip's `data-state` would hide which one is on.
            return (
              <ToggleGroupItem
                key={mode}
                value={mode}
                aria-label={t(`editor.view.${mode}`)}
                title={t(`editor.view.${mode}`)}
              >
                <Icon />
              </ToggleGroupItem>
            );
          })}
        </ToggleGroup>
      ) : null}
      <Button variant="outline" size="sm" onClick={onDone}>
        {t("editor.done")}
      </Button>
      <Button size="sm" disabled={!canSave} onClick={onSave}>
        {saving ? <Spinner /> : <Save />}
        {t("editor.save")}
        <Kbd className="bg-primary-foreground/15 text-primary-foreground">{saveShortcut}</Kbd>
      </Button>
    </>
  );
}
