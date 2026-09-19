import type { Skill } from "@skillboard/shared";
import { Plus } from "lucide-react";
import { type FormEvent, type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { TagPill } from "@/components/TagPill";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useSetSkillTags } from "@/hooks/mutations/skills";
import { useAllTags } from "@/hooks/queries/skills";

const MAX_SUGGESTIONS = 10;

/** A skill's tags, editable in place: remove with ×, add by typing or picking an existing tag. */
export function SkillTagsEditor({ skill }: { skill: Skill }): ReactNode {
  const { t } = useTranslation();
  const allTags = useAllTags();
  const setTags = useSetSkillTags();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");

  const save = (tags: string[]): void => setTags.mutate({ skillId: skill.id, tags });

  const add = (raw: string): void => {
    const tag = raw.trim();
    setDraft("");
    if (tag && !skill.tags.includes(tag)) save([...skill.tags, tag]);
  };

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    add(draft);
  };

  const needle = draft.trim().toLowerCase();
  const suggestions = (allTags.data ?? [])
    .filter((tag) => !skill.tags.includes(tag) && tag.toLowerCase().includes(needle))
    .slice(0, MAX_SUGGESTIONS);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {skill.tags.map((tag) => (
        <TagPill
          key={tag}
          tag={tag}
          onRemove={() => save(skill.tags.filter((entry) => entry !== tag))}
        />
      ))}
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setDraft("");
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex h-5 items-center gap-1 rounded-full border border-dashed px-2 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <Plus className="size-3" />
            {t("library.detail.addTag")}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="flex w-64 flex-col gap-2 p-2">
          <form onSubmit={submit}>
            <Input
              value={draft}
              className="h-8"
              placeholder={t("tags.addPlaceholder")}
              aria-label={t("library.detail.addTag")}
              onChange={(event) => setDraft(event.target.value)}
            />
          </form>
          {suggestions.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((tag) => (
                <TagPill key={tag} tag={tag} onClick={() => add(tag)} />
              ))}
            </div>
          ) : null}
        </PopoverContent>
      </Popover>
    </div>
  );
}
