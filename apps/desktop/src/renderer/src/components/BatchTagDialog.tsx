import type { Skill } from "@skillboard/shared";
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
import { useSetSkillTags } from "@/hooks/mutations/skills";
import { useAllTags } from "@/hooks/queries/skills";
import { toastSuccess } from "@/lib/toast";

export interface BatchTagDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  skills: readonly Skill[];
  onDone?: () => void;
}

const MAX_SUGGESTIONS = 12;

/** The form lives in its own component so every opening starts with nothing marked. */
function BatchTagForm({
  onOpenChange,
  skills,
  onDone,
}: Omit<BatchTagDialogProps, "open">): ReactNode {
  const { t } = useTranslation();
  const setTags = useSetSkillTags();
  const allTags = useAllTags();
  const [removing, setRemoving] = useState<ReadonlySet<string>>(new Set());
  const [adding, setAdding] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const current = useMemo(() => {
    const counts = new Map<string, number>();
    for (const skill of skills)
      for (const tag of skill.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [skills]);

  const suggestions = (allTags.data ?? [])
    .filter(
      (tag) => !adding.includes(tag) && tag.toLowerCase().includes(draft.trim().toLowerCase()),
    )
    .slice(0, MAX_SUGGESTIONS);

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
    setSaving(true);
    const jobs = skills.flatMap((skill) => {
      const next = [
        ...skill.tags.filter((tag) => !removing.has(tag)),
        ...adding.filter((tag) => !skill.tags.includes(tag)),
      ];
      const changed =
        next.length !== skill.tags.length || next.some((tag, index) => tag !== skill.tags[index]);
      return changed ? [setTags.mutateAsync({ skillId: skill.id, tags: next })] : [];
    });
    const results = await Promise.allSettled(jobs);
    setSaving(false);
    const saved = results.filter((result) => result.status === "fulfilled").length;
    if (saved > 0) toastSuccess(t("tags.batchSaved", { count: saved }));
    if (saved === results.length) {
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
        <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
          {t("tags.current")}
        </p>
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
                onClick={() =>
                  setRemoving((previous) => {
                    const next = new Set(previous);
                    if (next.has(tag)) next.delete(tag);
                    else next.add(tag);
                    return next;
                  })
                }
              />
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
          {t("tags.add")}
        </p>
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
        <Button type="submit" disabled={!dirty || saving}>
          {saving ? <Spinner /> : null}
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
