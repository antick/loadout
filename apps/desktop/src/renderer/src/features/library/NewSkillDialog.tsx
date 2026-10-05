import {
  DEFAULT_NEW_SKILL_TEMPLATE,
  NEW_SKILL_DOCUMENT,
  NEW_SKILL_TEMPLATES,
  type NewSkillTemplate,
  isNewSkillTemplate,
  SKILL_DESCRIPTION_MAX,
  SKILL_NAME_MAX,
  newSkillDescriptionProblem,
  newSkillNameProblem,
  skillAuthoringPrompt,
  toSkillNameInput,
  takenSkillNames,
} from "@loadout/shared";
import { useNavigate } from "@tanstack/react-router";
import { ClipboardCopy } from "lucide-react";
import { type FormEvent, type ReactNode, useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { OptionSelect } from "@/components/OptionSelect";
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
import { useCreateSkill, useCreateProjectSkill } from "@/features/library/library-mutations";
import { useAppInfo, useLibraryLocation } from "@/hooks/queries/app";
import { useSkills } from "@/hooks/queries/skills";
import { usePersistedState } from "@/hooks/use-persisted-state";
import { STORAGE_KEYS } from "@/lib/constants";
import { compactHome, joinPath } from "@/lib/paths";
import { editLink } from "@/lib/skill-location";
import { toastSuccess } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { NewSkillPlaceField } from "./NewSkillPlaceField";
import { newSkillFolders } from "./new-skill-folders";
import { useCopyText } from "@/hooks/mutations/app";
import { useNewSkillPlace } from "./use-new-skill-place";

export interface NewSkillDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Start with this project chosen instead of the library. */
  projectId?: string | null;
}

/** The form lives in its own component so every opening starts empty. */
function NewSkillForm({ onOpenChange, projectId }: Omit<NewSkillDialogProps, "open">): ReactNode {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const createInLibrary = useCreateSkill();
  const createInProject = useCreateProjectSkill();
  const place = useNewSkillPlace(projectId ?? null);
  const copyText = useCopyText(() => null);
  const { project } = place;
  const pending = createInLibrary.isPending || createInProject.isPending;
  const { data: skills } = useSkills();
  const { data: location } = useLibraryLocation();
  const { data: info } = useAppInfo();
  const nameId = useId();
  const descriptionId = useId();
  const templateId = useId();
  // The outline chosen last time is the one people want again.
  const [storedTemplate, setTemplate] = usePersistedState<NewSkillTemplate>(
    STORAGE_KEYS.newSkillTemplate,
    DEFAULT_NEW_SKILL_TEMPLATE,
  );
  const template = isNewSkillTemplate(storedTemplate) ? storedTemplate : DEFAULT_NEW_SKILL_TEMPLATE;
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  // Problems show once the field was left or the form was sent, not while the first word is typed.
  const [nameTouched, setNameTouched] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  /** Which button sent the form, so its own spinner turns. */
  const [sentWithPrompt, setSentWithPrompt] = useState(false);

  const libraryNames = useMemo(() => takenSkillNames(skills ?? []), [skills]);
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

  const { main: skillFolder, copies: copyFolders } = newSkillFolders({
    name: trimmedName && !nameProblem ? trimmedName : null,
    project,
    targets: place.targets,
    libraryPath: location?.path ?? null,
  });
  const folderPath = skillFolder ? joinPath(skillFolder, NEW_SKILL_DOCUMENT) : null;
  const folder = folderPath ? compactHome(folderPath, info?.homeDir) : null;
  const moreFolders = copyFolders.length;

  /** The prompt goes to the clipboard; the skill is created whether or not copying works. */
  const copyPrompt = async (skillName: string, skillPath: string): Promise<void> => {
    const prompt = skillAuthoringPrompt({
      name: skillName,
      description: trimmedDescription,
      folder: skillPath,
      copies: copyFolders,
    });
    // Its own toasts: the copy says what was created, and a failed copy still created the skill.
    await copyText.mutateAsync(prompt).then(
      () =>
        toastSuccess(
          t("library.create.promptCopied", { name: skillName }),
          t("library.create.promptCopiedHint"),
        ),
      () => toastSuccess(t("library.create.created", { name: skillName })),
    );
  };

  const created = (createdName: string, promptFolder: string | null): void => {
    onOpenChange(false);
    if (promptFolder) {
      void copyPrompt(createdName, promptFolder);
      return;
    }
    toastSuccess(
      t("library.create.created", { name: createdName }),
      t(project ? "library.create.createdInProjectHint" : "library.create.createdHint"),
    );
  };

  const submit = (event: FormEvent, withPrompt = false): void => {
    event.preventDefault();
    setSubmitted(true);
    if (!valid || pending) return;
    setSentWithPrompt(withPrompt);
    const skill = { name: trimmedName, description: trimmedDescription, template };
    if (project) {
      createInProject.mutate(
        { projectId: project.id, skill, agentKeys: place.agentKeys },
        {
          onSuccess: (ref) => {
            created(skill.name, withPrompt ? skillFolder : null);
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
        created(saved.name, withPrompt ? saved.libraryPath : null);
        void navigate(editLink({ kind: "library", skillId: saved.id }));
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
        <Field>
          <FieldLabel htmlFor={templateId}>{t("library.create.template.label")}</FieldLabel>
          <OptionSelect
            id={templateId}
            value={template}
            options={NEW_SKILL_TEMPLATES}
            labelOf={(option) => t(`library.create.template.names.${option}`)}
            onChange={setTemplate}
            className="w-full"
          />
          <FieldDescription>{t(`library.create.template.hints.${template}`)}</FieldDescription>
        </Field>
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
          {t("common.cancel")}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={!valid || pending}
          title={t(
            moreFolders > 0 ? "library.create.promptHintCopies" : "library.create.promptHint",
          )}
          onClick={(event) => submit(event, true)}
        >
          {pending && sentWithPrompt ? <Spinner /> : <ClipboardCopy />}
          {t("library.create.submitPrompt")}
        </Button>
        <Button type="submit" disabled={!valid || pending}>
          {pending && !sentWithPrompt ? <Spinner /> : null}
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
