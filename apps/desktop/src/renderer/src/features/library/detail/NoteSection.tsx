import { SKILL_NOTE_MAX_LENGTH, type Skill } from "@loadout/shared";
import { PencilLine, StickyNote } from "lucide-react";
import { type KeyboardEvent, type ReactNode, useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { PageSection } from "@/components/PageSection";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useSetSkillNote } from "@/features/library/detail/skill-mutations";
import { ownsEscape } from "@/lib/escape";

/** Show the character count once the note is this close to the cap. */
const COUNT_FROM = SKILL_NOTE_MAX_LENGTH - 200;

/**
 * The user's own note on the skill: shown as written, edited in place. Kept by Loadout, never
 * written into SKILL.md; the library search finds it.
 */
export function NoteSection({ skill }: { skill: Skill }): ReactNode {
  const { t } = useTranslation();
  const save = useSetSkillNote();
  const fieldId = useId();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const field = useRef<HTMLTextAreaElement>(null);
  // The field appears in place of the note; put the cursor at its end right away.
  useEffect(() => {
    if (!editing) return;
    const element = field.current;
    element?.focus();
    element?.setSelectionRange(element.value.length, element.value.length);
  }, [editing]);

  const start = (): void => {
    setDraft(skill.note ?? "");
    setEditing(true);
  };
  const submit = (): void => {
    save.mutate({ skillId: skill.id, note: draft }, { onSuccess: () => setEditing(false) });
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      setEditing(false);
    } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      submit();
    }
  };

  if (editing) {
    return (
      <PageSection title={t("library.note.title")}>
        <div className="flex flex-col gap-2">
          <Textarea
            id={fieldId}
            ref={field}
            value={draft}
            maxLength={SKILL_NOTE_MAX_LENGTH}
            aria-label={t("library.note.title")}
            placeholder={t("library.note.placeholder")}
            className="min-h-24 text-sm"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
            {...ownsEscape}
          />
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" disabled={save.isPending} onClick={submit}>
              {t("common.save")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={save.isPending}
              onClick={() => setEditing(false)}
            >
              {t("common.cancel")}
            </Button>
            <p className="ml-auto text-xs text-muted-foreground">
              {draft.length >= COUNT_FROM
                ? t("library.note.count", { count: draft.length, max: SKILL_NOTE_MAX_LENGTH })
                : t("library.note.hint")}
            </p>
          </div>
        </div>
      </PageSection>
    );
  }

  if (!skill.note) {
    return (
      <PageSection
        title={t("library.note.title")}
        actions={
          <Button type="button" variant="outline" size="xs" onClick={start}>
            <StickyNote />
            {t("library.note.add")}
          </Button>
        }
      >
        <p className="text-xs text-muted-foreground">{t("library.note.empty")}</p>
      </PageSection>
    );
  }

  return (
    <PageSection
      title={t("library.note.title")}
      actions={
        <Button type="button" variant="ghost" size="xs" onClick={start}>
          <PencilLine />
          {t("library.note.edit")}
        </Button>
      }
    >
      <p
        data-selectable
        className="rounded-lg border bg-muted/30 px-3 py-2.5 text-sm whitespace-pre-wrap"
      >
        {skill.note}
      </p>
    </PageSection>
  );
}
