import type { Preset } from "@skillboard/shared";
import { type FormEvent, type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { PresetIconPicker } from "@/components/PresetIconPicker";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useSavePreset } from "@/hooks/mutations/presets";
import { DEFAULT_PRESET_ICON_ID } from "@/lib/preset-icons";

export interface PresetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Edit this preset; omit to create one. */
  preset?: Preset | null;
  onSaved?: (preset: Preset) => void;
}

/** The form lives in its own component so every opening starts from the preset's current values. */
function PresetForm({ preset, onOpenChange, onSaved }: Omit<PresetDialogProps, "open">): ReactNode {
  const { t } = useTranslation();
  const save = useSavePreset();
  const [name, setName] = useState(preset?.name ?? "");
  const [description, setDescription] = useState(preset?.description ?? "");
  const [icon, setIcon] = useState(preset?.icon ?? DEFAULT_PRESET_ICON_ID);

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (!name.trim()) return;
    save.mutate(
      {
        id: preset?.id,
        input: { name: name.trim(), description: description.trim() || null, icon },
      },
      {
        onSuccess: (saved) => {
          onOpenChange(false);
          onSaved?.(saved);
        },
      },
    );
  };

  return (
    <form onSubmit={submit} className="contents">
      <DialogHeader>
        <DialogTitle>{t(preset ? "presets.editTitle" : "presets.createTitle")}</DialogTitle>
        <DialogDescription>{t("presets.dialogDescription")}</DialogDescription>
      </DialogHeader>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="preset-name">{t("presets.name")}</FieldLabel>
          <Input
            id="preset-name"
            value={name}
            required
            placeholder={t("presets.namePlaceholder")}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="preset-description">{t("presets.description")}</FieldLabel>
          <Textarea
            id="preset-description"
            rows={2}
            value={description}
            placeholder={t("presets.descriptionPlaceholder")}
            onChange={(event) => setDescription(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel>{t("presets.icon")}</FieldLabel>
          <PresetIconPicker value={icon} onChange={setIcon} />
        </Field>
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" disabled={!name.trim() || save.isPending}>
          {save.isPending ? <Spinner /> : null}
          {t(preset ? "common.save" : "presets.create")}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Create or edit a preset: name, description and icon. */
export function PresetDialog({
  open,
  onOpenChange,
  preset,
  onSaved,
}: PresetDialogProps): ReactNode {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <PresetForm preset={preset} onOpenChange={onOpenChange} onSaved={onSaved} />
      </DialogContent>
    </Dialog>
  );
}
