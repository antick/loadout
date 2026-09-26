import {
  LIBRARY_SKILLS_DIR_NAME,
  NEW_SKILL_DOCUMENT,
  SKILL_DESCRIPTION_MAX,
  SKILL_NAME_MAX,
  type Skill,
  newSkillDescriptionProblem,
  newSkillNameProblem,
  toSkillNameInput,
} from "@loadout/shared";
import { useNavigate } from "@tanstack/react-router";
import { type FormEvent, type ReactNode, useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
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
import { Textarea } from "@/components/ui/textarea";
import { useCreateSkill } from "@/hooks/mutations/library";
import { useAppInfo, useLibraryLocation } from "@/hooks/queries/app";
import { useSkills } from "@/hooks/queries/skills";
import { compactHome, joinPath } from "@/lib/paths";
import { toastSuccess } from "@/lib/toast";
import { cn } from "@/lib/utils";

export interface NewSkillDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Library names and folder names, lower-cased: a new skill may match neither. */
function takenNames(skills: readonly Skill[] | undefined): Set<string> {
  return new Set(
    (skills ?? []).flatMap((skill) => [skill.name.toLowerCase(), skill.dirName.toLowerCase()]),
  );
}

/** The form lives in its own component so every opening starts empty. */
function NewSkillForm({ onOpenChange }: Omit<NewSkillDialogProps, "open">): ReactNode {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const create = useCreateSkill();
  const { data: skills } = useSkills();
  const { data: location } = useLibraryLocation();
  const { data: info } = useAppInfo();
  const nameId = useId();
  const descriptionId = useId();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  // Problems show once the field was left or the form was sent, not while the first word is typed.
  const [nameTouched, setNameTouched] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const taken = useMemo(() => takenNames(skills), [skills]);
  const trimmedName = name.trim();
  const trimmedDescription = description.trim();
  const nameProblem = newSkillNameProblem(trimmedName) ?? (taken.has(trimmedName) ? "taken" : null);
  const descriptionProblem = newSkillDescriptionProblem(trimmedDescription);
  const showNameProblem =
    nameProblem !== null && nameProblem !== "empty" && (nameTouched || submitted);
  const showDescriptionProblem = descriptionProblem === "too_long";
  const valid = nameProblem === null && descriptionProblem === null;

  const folder =
    location && trimmedName && !nameProblem
      ? compactHome(
          joinPath(
            location.path,
            `${LIBRARY_SKILLS_DIR_NAME}/${trimmedName}/${NEW_SKILL_DOCUMENT}`,
          ),
          info?.homeDir,
        )
      : null;

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    setSubmitted(true);
    if (!valid || create.isPending) return;
    create.mutate(
      { name: trimmedName, description: trimmedDescription },
      {
        onSuccess: (skill) => {
          onOpenChange(false);
          toastSuccess(
            t("library.create.created", { name: skill.name }),
            t("library.create.createdHint"),
          );
          void navigate({ to: "/library/$skillId/edit", params: { skillId: skill.id } });
        },
      },
    );
  };

  return (
    <form onSubmit={submit} className="contents" noValidate>
      <DialogHeader>
        <DialogTitle>{t("library.create.title")}</DialogTitle>
        <DialogDescription>{t("library.create.description")}</DialogDescription>
      </DialogHeader>
      <FieldGroup>
        <Field data-invalid={showNameProblem || undefined}>
          <FieldLabel htmlFor={nameId}>{t("library.create.name")}</FieldLabel>
          <Input
            id={nameId}
            value={name}
            spellCheck={false}
            autoComplete="off"
            maxLength={SKILL_NAME_MAX * 2}
            aria-invalid={showNameProblem}
            placeholder={t("library.create.namePlaceholder")}
            className="font-mono text-sm"
            onChange={(event) => setName(toSkillNameInput(event.target.value))}
            onBlur={() => setNameTouched(Boolean(name))}
          />
          {showNameProblem ? (
            <FieldError>
              {t(`library.create.nameProblem.${nameProblem}`, {
                max: SKILL_NAME_MAX,
                name: trimmedName,
              })}
            </FieldError>
          ) : (
            <FieldDescription>
              {folder ? (
                <span className="block truncate font-mono text-xs" title={folder}>
                  {folder}
                </span>
              ) : (
                t("library.create.nameHint")
              )}
            </FieldDescription>
          )}
        </Field>
        <Field data-invalid={showDescriptionProblem || undefined}>
          <div className="flex items-baseline justify-between gap-3">
            <FieldLabel htmlFor={descriptionId}>{t("library.create.descriptionLabel")}</FieldLabel>
            <span
              className={cn(
                "text-xs tabular-nums text-muted-foreground",
                showDescriptionProblem && "text-danger",
              )}
              aria-hidden
            >
              {t("library.create.counter", {
                count: trimmedDescription.length,
                max: SKILL_DESCRIPTION_MAX,
              })}
            </span>
          </div>
          <Textarea
            id={descriptionId}
            rows={3}
            value={description}
            aria-invalid={showDescriptionProblem}
            placeholder={t("library.create.descriptionPlaceholder")}
            onChange={(event) => setDescription(event.target.value)}
          />
          {showDescriptionProblem ? (
            <FieldError>
              {t("library.create.descriptionTooLong", { max: SKILL_DESCRIPTION_MAX })}
            </FieldError>
          ) : (
            <FieldDescription>{t("library.create.descriptionHint")}</FieldDescription>
          )}
        </Field>
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" disabled={!valid || create.isPending}>
          {create.isPending ? <Spinner /> : null}
          {t("library.create.submit")}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Start a skill from scratch: a name and a description, then straight into the editor. */
export function NewSkillDialog({ open, onOpenChange }: NewSkillDialogProps): ReactNode {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <NewSkillForm onOpenChange={onOpenChange} />
      </DialogContent>
    </Dialog>
  );
}
