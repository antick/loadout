import {
  type RenameResult,
  SKILL_NAME_MAX,
  type Skill,
  newSkillNameProblem,
  toSkillNameInput,
} from "@loadout/shared";
import { FolderSymlink, Info, TriangleAlert } from "lucide-react";
import { type FormEvent, type ReactNode, useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { InlineNotice } from "@/components/InlineNotice";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useRenameSkill } from "@/hooks/mutations/skills";
import { useAgents } from "@/hooks/queries/agents";
import { useRenamePreview, useSkills } from "@/hooks/queries/skills";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { errorMessage } from "@/lib/toast";

export interface RenameSkillDialogProps {
  /** The skill to rename; null keeps the dialog closed. */
  skill: Skill | null;
  onOpenChange: (open: boolean) => void;
}

/** What the rename will touch, from the dry run: deployments, project links, project copies. */
function RenamePreview({ preview }: { preview: RenameResult }): ReactNode {
  const { t } = useTranslation();
  const agents = useAgents().data ?? [];
  const nameOf = (key: string): string =>
    agents.find((agent) => agent.key === key)?.displayName ?? key;
  return (
    <div className="flex flex-col gap-2">
      <InlineNotice tone="info" icon={Info}>
        {preview.agents.length > 0
          ? t("library.rename.movesDeployments", {
              agents: preview.agents.map(nameOf).join(", "),
            })
          : t("library.rename.noDeployments")}
      </InlineNotice>
      {preview.projectLinks.length > 0 ? (
        <InlineNotice tone="info" icon={FolderSymlink}>
          {t("library.rename.projectLinks", { count: preview.projectLinks.length })}
        </InlineNotice>
      ) : null}
      {preview.projectCopies.length > 0 ? (
        <InlineNotice tone="warning" icon={TriangleAlert}>
          {t("library.rename.projectCopies", {
            count: preview.projectCopies.length,
            name: preview.from,
          })}
        </InlineNotice>
      ) : null}
    </div>
  );
}

/** The form lives in its own component so every opening starts from the skill's own name. */
function RenameSkillForm({
  skill,
  onOpenChange,
}: {
  skill: Skill;
  onOpenChange: (open: boolean) => void;
}): ReactNode {
  const { t } = useTranslation();
  const nameId = useId();
  const rename = useRenameSkill();
  const { data: skills } = useSkills();
  const [name, setName] = useState(skill.dirName);

  const taken = useMemo(
    () =>
      new Set(
        (skills ?? []).flatMap((other) =>
          other.id === skill.id ? [] : [other.name.toLowerCase(), other.dirName.toLowerCase()],
        ),
      ),
    [skills, skill.id],
  );
  const trimmed = name.trim();
  const unchanged = trimmed === skill.dirName && trimmed === skill.name;
  const problem =
    newSkillNameProblem(trimmed) ?? (taken.has(trimmed.toLowerCase()) ? "taken" : null);
  // The dry run follows the name once typing pauses; it catches what only the disk knows.
  const settled = useDebouncedValue(problem || unchanged ? null : trimmed);
  const preview = useRenamePreview(skill.id, settled);
  const current = settled === trimmed ? preview : null;
  const ready = !problem && !unchanged && current?.isSuccess === true;

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (!ready || rename.isPending) return;
    rename.mutate({ skillId: skill.id, name: trimmed }, { onSuccess: () => onOpenChange(false) });
  };

  return (
    <form onSubmit={submit} className="contents" noValidate>
      <DialogHeader>
        <DialogTitle>{t("library.rename.title", { name: skill.name })}</DialogTitle>
        <DialogDescription>{t("library.rename.description")}</DialogDescription>
      </DialogHeader>
      <Field data-invalid={Boolean(problem && problem !== "empty") || undefined}>
        <FieldLabel htmlFor={nameId}>{t("library.create.name")}</FieldLabel>
        <Input
          id={nameId}
          value={name}
          spellCheck={false}
          autoComplete="off"
          maxLength={SKILL_NAME_MAX * 2}
          className="font-mono text-sm"
          onChange={(event) => setName(toSkillNameInput(event.target.value))}
        />
        {problem && problem !== "empty" ? (
          <FieldError>
            {t(`library.create.nameProblem.${problem}`, { max: SKILL_NAME_MAX, name: trimmed })}
          </FieldError>
        ) : current?.isError ? (
          <FieldError>{errorMessage(current.error)}</FieldError>
        ) : (
          <FieldDescription>{t("library.create.nameHint")}</FieldDescription>
        )}
      </Field>
      {current?.data ? <RenamePreview preview={current.data} /> : null}
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" disabled={!ready || rename.isPending}>
          {rename.isPending || current?.isFetching ? <Spinner /> : null}
          {t("library.rename.submit")}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Rename a library skill: its folder, the name in SKILL.md, deployments and project links. */
export function RenameSkillDialog({ skill, onOpenChange }: RenameSkillDialogProps): ReactNode {
  return (
    <Dialog open={skill !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {skill ? <RenameSkillForm skill={skill} onOpenChange={onOpenChange} /> : null}
      </DialogContent>
    </Dialog>
  );
}
