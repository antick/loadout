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
import { useCreateProjectSkill } from "@/hooks/mutations/project-detail";
import { useAppInfo, useLibraryLocation } from "@/hooks/queries/app";
import { useSkills } from "@/hooks/queries/skills";
import { compactHome, joinPath } from "@/lib/paths";
import { toastSuccess } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { NewSkillPlaceField } from "./NewSkillPlaceField";
import { useNewSkillPlace } from "./use-new-skill-place";

export interface NewSkillDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Start with this project chosen instead of the library. */
  projectId?: string | null;
}

/** Library names and folder names, lower-cased: a new skill may match neither. */
function takenNames(skills: readonly Skill[] | undefined): Set<string> {
  return new Set(
    (skills ?? []).flatMap((skill) => [skill.name.toLowerCase(), skill.dirName.toLowerCase()]),
  );
}

/** The form lives in its own component so every opening starts empty. */
function NewSkillForm({ onOpenChange, projectId }: Omit<NewSkillDialogProps, "open">): ReactNode {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const createInLibrary = useCreateSkill();
  const createInProject = useCreateProjectSkill();
  const place = useNewSkillPlace(projectId ?? null);
  const { project } = place;
  const pending = createInLibrary.isPending || createInProject.isPending;
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

  const libraryNames = useMemo(() => takenNames(skills), [skills]);
  const taken = project ? place.taken : libraryNames;
  const trimmedName = name.trim();
  const trimmedDescription = description.trim();
  const nameProblem =
    newSkillNameProblem(trimmedName) ??
    (taken.has(trimmedName) ? (project ? "takenProject" : "taken") : null);
  const descriptionProblem = newSkillDescriptionProblem(trimmedDescription);
  const showNameProblem =
    nameProblem !== null && nameProblem !== "empty" && (nameTouched || submitted);
  const showDescriptionProblem = descriptionProblem === "too_long";
  const placeReady = place.ready && (!project || place.targets.length > 0);
  const valid = nameProblem === null && descriptionProblem === null && placeReady;

  const [firstTarget] = place.targets;
  const folderPath =
    !trimmedName || nameProblem
      ? null
      : project
        ? firstTarget
          ? joinPath(
              project.path,
              [firstTarget.relativeDir, trimmedName, NEW_SKILL_DOCUMENT].filter(Boolean).join("/"),
            )
          : null
        : location
          ? joinPath(
              location.path,
              `${LIBRARY_SKILLS_DIR_NAME}/${trimmedName}/${NEW_SKILL_DOCUMENT}`,
            )
          : null;
  const folder = folderPath ? compactHome(folderPath, info?.homeDir) : null;
  const moreFolders = project ? place.targets.length - 1 : 0;

  const created = (name: string): void => {
    onOpenChange(false);
    toastSuccess(
      t("library.create.created", { name }),
      t(project ? "library.create.createdInProjectHint" : "library.create.createdHint"),
    );
  };

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    setSubmitted(true);
    if (!valid || pending) return;
    const skill = { name: trimmedName, description: trimmedDescription };
    if (project) {
      createInProject.mutate(
        { projectId: project.id, skill, agentKeys: place.agentKeys },
        {
          onSuccess: (ref) => {
            created(skill.name);
            void navigate({
              to: "/projects/$projectId/edit",
              params: { projectId: project.id },
              search: { skill: ref.relativePath, agent: ref.agentKey },
            });
          },
        },
      );
      return;
    }
    createInLibrary.mutate(skill, {
      onSuccess: (saved) => {
        created(saved.name);
        void navigate({ to: "/library/$skillId/edit", params: { skillId: saved.id } });
      },
    });
  };

  return (
    <form onSubmit={submit} className="contents" noValidate>
      <DialogHeader>
        <DialogTitle>{t("library.create.title")}</DialogTitle>
        <DialogDescription>
          {project
            ? t("library.create.descriptionProject", { project: project.name })
            : t("library.create.description")}
        </DialogDescription>
      </DialogHeader>
      <FieldGroup>
        {place.projects.length > 0 ? <NewSkillPlaceField place={place} /> : null}
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
                project: project?.name,
              })}
            </FieldError>
          ) : (
            <FieldDescription>
              {folder ? (
                <span className="block truncate font-mono text-xs" title={folder}>
                  {moreFolders > 0
                    ? t("library.create.place.moreFolders", { path: folder, count: moreFolders })
                    : folder}
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
        <Button type="submit" disabled={!valid || pending}>
          {pending ? <Spinner /> : null}
          {t("library.create.submit")}
        </Button>
      </DialogFooter>
    </form>
  );
}

/**
 * Start a skill from scratch, in the library or straight in a project: a name and a description,
 * then into the editor.
 */
export function NewSkillDialog({ open, onOpenChange, projectId }: NewSkillDialogProps): ReactNode {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <NewSkillForm onOpenChange={onOpenChange} projectId={projectId} />
      </DialogContent>
    </Dialog>
  );
}
