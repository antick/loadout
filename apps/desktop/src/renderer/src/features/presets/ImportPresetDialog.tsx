import {
  PRESET_FILE_DIALOG_EXTENSIONS,
  type PresetImportPlan,
  type PresetImportSkillState,
} from "@loadout/shared";
import { useNavigate } from "@tanstack/react-router";
import { FileJson } from "lucide-react";
import { type FormEvent, type ReactNode, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { StatusBadge, type StatusTone } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useImportPreset, usePreviewPresetImport } from "@/hooks/mutations/preset-share";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/toast";

const STATE_TONES: Record<PresetImportSkillState, StatusTone> = {
  library: "success",
  source: "info",
  files: "info",
  missing: "warning",
};

export interface ImportPresetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** What the import will do with each skill, and the counts. */
function PlanList({ plan }: { plan: PresetImportPlan }): ReactNode {
  const { t } = useTranslation();
  const count = (state: PresetImportSkillState): number =>
    plan.skills.filter((skill) => skill.state === state).length;
  const toInstall = count("source") + count("files");
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted-foreground">
        {[
          t("presetShare.import.summary.install", { count: toInstall }),
          t("presetShare.import.summary.library", { count: count("library") }),
          count("missing") > 0
            ? t("presetShare.import.summary.missing", { count: count("missing") })
            : "",
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      <ul className="flex max-h-64 flex-col divide-y overflow-y-auto rounded-lg border bg-card">
        {plan.skills.map((skill) => (
          <li key={skill.name} className="flex items-center gap-3 px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{skill.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {skill.description ?? t("skills.noDescription")}
              </p>
            </div>
            <StatusBadge
              tone={STATE_TONES[skill.state]}
              label={t(`presetShare.import.state.${skill.state}`, { from: skill.from })}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Where the preset comes from, what it holds, and its name here. Fresh on every opening. */
function ImportForm({ onOpenChange }: Omit<ImportPresetDialogProps, "open">): ReactNode {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const preview = usePreviewPresetImport();
  const importPreset = useImportPreset();
  const inputId = useId();
  const nameId = useId();
  const [input, setInput] = useState("");
  const [name, setName] = useState("");
  const plan = preview.data;

  const look = (value: string): void => {
    const trimmed = value.trim();
    if (!trimmed) return;
    preview.mutate(trimmed, { onSuccess: (found) => setName(found.name) });
  };

  const choose = async (): Promise<void> => {
    const path = await api.app.pickFile(
      { name: t("presetShare.fileType"), extensions: PRESET_FILE_DIALOG_EXTENSIONS },
      t("presetShare.import.pickTitle"),
    );
    if (!path) return;
    setInput(path);
    look(path);
  };

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (!plan) {
      look(input);
      return;
    }
    importPreset.mutate(
      { input: input.trim(), name: name.trim() || undefined },
      {
        onSuccess: (result) => {
          if (!result) return;
          onOpenChange(false);
          void navigate({ to: "/presets/$presetId", params: { presetId: result.preset.id } });
        },
      },
    );
  };

  const busy = preview.isPending || importPreset.isPending;
  const renamed = plan && name.trim() && name.trim() !== plan.name;

  return (
    <form onSubmit={submit} className="contents" noValidate>
      <DialogHeader>
        <DialogTitle>{t("presetShare.import.title")}</DialogTitle>
        <DialogDescription>{t("presetShare.import.description")}</DialogDescription>
      </DialogHeader>
      <FieldGroup>
        <Field data-invalid={preview.isError || undefined}>
          <FieldLabel htmlFor={inputId}>{t("presetShare.import.inputLabel")}</FieldLabel>
          <div className="flex items-center gap-2">
            <Input
              id={inputId}
              value={input}
              spellCheck={false}
              autoComplete="off"
              placeholder={t("presetShare.import.inputPlaceholder")}
              className="flex-1 font-mono text-xs"
              onChange={(event) => {
                setInput(event.target.value);
                if (plan || preview.isError) preview.reset();
              }}
            />
            <Button type="button" variant="outline" size="sm" onClick={() => void choose()}>
              <FileJson />
              {t("presetShare.import.choose")}
            </Button>
          </div>
          {preview.isError ? (
            <FieldError>{errorMessage(preview.error)}</FieldError>
          ) : (
            <FieldDescription>{t("presetShare.import.inputHint")}</FieldDescription>
          )}
        </Field>
        {plan ? (
          <>
            <Field>
              <FieldLabel htmlFor={nameId}>{t("presetShare.import.nameLabel")}</FieldLabel>
              <Input id={nameId} value={name} onChange={(event) => setName(event.target.value)} />
              {plan.nameTaken && !renamed ? (
                <FieldDescription>{t("presetShare.import.nameTaken")}</FieldDescription>
              ) : null}
            </Field>
            <PlanList plan={plan} />
          </>
        ) : null}
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" disabled={busy || !input.trim()}>
          {busy ? <Spinner /> : null}
          {plan ? t("presetShare.import.submit") : t("presetShare.import.look")}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Create a preset from a file someone shared, installing the skills the library lacks. */
export function ImportPresetDialog({ open, onOpenChange }: ImportPresetDialogProps): ReactNode {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {open ? <ImportForm onOpenChange={onOpenChange} /> : null}
      </DialogContent>
    </Dialog>
  );
}
