import { compareNames, editTags } from "@loadout/shared";
import type { Skill } from "@loadout/shared";
import { type FormEvent, type ReactNode, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { TagPill } from "@/components/TagPill";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useSetTagsOfSkills } from "@/hooks/mutations/skills";
import { useAllTags } from "@/hooks/queries/skills";
import { tagSuggestions } from "@/lib/tag-filter";
import { SECTION_LABEL } from "@/lib/styles";
import { toggleIn } from "@/lib/sets";

export interface BatchTagDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  skills: readonly Skill[];
  onDone?: () => void;
}

/** The form lives in its own component so every opening starts with nothing marked. */
function BatchTagForm({
  onOpenChange,
  skills,
  onDone,
}: Omit<BatchTagDialogProps, "open">): ReactNode {
  const { t } = useTranslation();
  const setTags = useSetTagsOfSkills();
  const allTags = useAllTags();
  const [removing, setRemoving] = useState<ReadonlySet<string>>(new Set());
  const [adding, setAdding] = useState<string[]>([]);
  const [draft, setDraft] = useState("");

  const current = useMemo(() => {
    const counts = new Map<string, number>();
    for (const skill of skills)
      for (const tag of skill.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    return [...counts.entries()].sort(([a], [b]) => compareNames(a, b));
  }, [skills]);

  const suggestions = tagSuggestions(allTags.data, adding, draft);

  const addTag = (raw: string): void => {
    const tag = raw.trim();
    if (tag && !adding.includes(tag)) setAdding((previous) => [...previous, tag]);
    setDraft("");
  };

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (draft.trim()) {
      addTag(draft);
      return;
    }
    const changes = skills.flatMap((skill) => {
      const tags = editTags(skill.tags, adding, [...removing]);
      const changed =
        tags.length !== skill.tags.length || tags.some((tag, index) => tag !== skill.tags[index]);
      return changed ? [{ skill, tags }] : [];
    });
    // Every skill already had what was asked: nothing to save, and nothing to report.
    if (changes.length === 0) {
      onOpenChange(false);
      onDone?.();
      return;
    }
    // A batch of one that failed has said so already; the dialog stays for another try.
    const result = await setTags.mutateAsync(changes).catch(() => null);
    if (result?.failed.length === 0) {
      onOpenChange(false);
      onDone?.();
    }
  };

  const dirty = removing.size > 0 || adding.length > 0 || draft.trim().length > 0;

  return (
    <form onSubmit={(event) => void submit(event)} className="contents">
      <DialogHeader>
        <DialogTitle>{t("tags.batchTitle", { count: skills.length })}</DialogTitle>
        <DialogDescription>{t("tags.batchDescription")}</DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-2">
        <p className={SECTION_LABEL}>{t("tags.current")}</p>
        {current.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("tags.noneYet")}</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {current.map(([tag, count]) => (
              <TagPill
                key={tag}
                tag={tag}
                count={count}
                struck={removing.has(tag)}
                onClick={() => setRemoving((previous) => toggleIn(previous, tag))}
              />
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <p className={SECTION_LABEL}>{t("tags.add")}</p>
        {adding.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {adding.map((tag) => (
              <TagPill
                key={tag}
                tag={tag}
                active
                onRemove={() => setAdding((previous) => previous.filter((entry) => entry !== tag))}
              />
            ))}
          </div>
        ) : null}
        <Input
          value={draft}
          placeholder={t("tags.addPlaceholder")}
          aria-label={t("tags.add")}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== ",") return;
            event.preventDefault();
            addTag(draft);
          }}
        />
        {suggestions.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((tag) => (
              <TagPill key={tag} tag={tag} onClick={() => addTag(tag)} />
            ))}
          </div>
        ) : null}
      </div>

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" disabled={!dirty || setTags.isPending}>
          {setTags.isPending ? <Spinner /> : null}
          {t("common.save")}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Edit tags of several skills at once: click a current tag to remove it, type to add new ones. */
export function BatchTagDialog({
  open,
  onOpenChange,
  skills,
  onDone,
}: BatchTagDialogProps): ReactNode {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <BatchTagForm skills={skills} onOpenChange={onOpenChange} onDone={onDone} />
      </DialogContent>
    </Dialog>
  );
}
