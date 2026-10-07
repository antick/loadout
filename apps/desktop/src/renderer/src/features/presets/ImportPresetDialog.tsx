import {
  PRESET_FILE_DIALOG_EXTENSIONS,
  type PresetImportPlan,
  type PresetImportSkill,
  type PresetImportSkillState,
} from "@loadout/shared";
import { useNavigate } from "@tanstack/react-router";
import { FileJson } from "lucide-react";
import { type FormEvent, type ReactNode, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { StatusBadge, type StatusTone } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  useImportPreset,
  usePickFile,
  usePreviewPresetImport,
} from "@/features/presets/preset-mutations";
import { errorMessage } from "@/lib/toast";
import { setMany } from "@/lib/sets";

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

/**
 * What the import will do with each skill, and the counts. A skill the library has a different
 * skill of the same name for can use that one instead, when the person ticks it (`reuse`).
 */
function PlanList({
  plan,
  reuse,
  onReuseChange,
}: {
  plan: PresetImportPlan;
  reuse: ReadonlySet<string>;
  onReuseChange: (name: string, used: boolean) => void;
}): ReactNode {
  const { t } = useTranslation();
  const stateOf = (skill: PresetImportSkill): PresetImportSkillState =>
    reuse.has(skill.name) ? "library" : skill.state;
  const count = (state: PresetImportSkillState): number =>
    plan.skills.filter((skill) => stateOf(skill) === state).length;
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
              {skill.sameNameSkillId ? (
                <>
                  {reuse.has(skill.name) ? null : (
                    <p className="text-xs text-muted-foreground">
                      {t("presetShare.import.sameName", { name: skill.name })}
                    </p>
                  )}
                  <label className="mt-1 flex items-center gap-2 text-xs">
                    <Checkbox
                      checked={reuse.has(skill.name)}
                      onCheckedChange={(checked) => onReuseChange(skill.name, checked === true)}
                    />
                    {t("presetShare.import.useMine", { name: skill.name })}
                  </label>
                </>
              ) : null}
            </div>
            <StatusBadge
              tone={STATE_TONES[stateOf(skill)]}
              label={t(`presetShare.import.state.${stateOf(skill)}`, { from: skill.from })}
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
  const pickFile = usePickFile();
  const inputId = useId();
  const nameId = useId();
  const [input, setInput] = useState("");
  const [name, setName] = useState("");
  const [reuse, setReuse] = useState<ReadonlySet<string>>(new Set());
  // The plan holds only for the input it was made from; Import sends exactly that input.
  const previewed = preview.variables;
  const plan = previewed === input.trim() ? preview.data : undefined;

  const look = (value: string): void => {
    const trimmed = value.trim();
    if (!trimmed) return;
    preview.mutate(trimmed, {
      onSuccess: (found) => {
        setName(found.name);
        setReuse(new Set());
      },
    });
  };

  const changeReuse = (skillName: string, used: boolean): void =>
    setReuse((current) => setMany(current, [skillName], used));

  const choose = async (): Promise<void> => {
    // A failing picker is toasted by the mutation.
    const path = await pickFile
      .mutateAsync({
        filter: { name: t("presetShare.fileType"), extensions: PRESET_FILE_DIALOG_EXTENSIONS },
        title: t("presetShare.import.pickTitle"),
      })
      .catch(() => null);
    if (!path) return;
    setInput(path);
    look(path);
  };

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (!plan || previewed === undefined) {
      look(input);
      return;
    }
    importPreset.mutate(
      { input: previewed, name: name.trim() || undefined, reuseSameName: [...reuse] },
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
                // Also drops a look still under way: its answer is for the old input.
                if (!preview.isIdle) preview.reset();
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
            <PlanList plan={plan} reuse={reuse} onReuseChange={changeReuse} />
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
