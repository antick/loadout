import { useNavigate } from "@tanstack/react-router";
import { Package } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { matchesSkillQuery } from "@loadout/shared";
import { useSkills } from "@/hooks/queries/skills";
import { MATCHED_SKILL_VALUE, keepMatchedSkills } from "@/lib/command-filter";
import { editLink } from "@/lib/skill-location";

export interface SkillPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** ⌘P: type part of a skill's name and open it in the editor, from anywhere, the editor included. */
export function SkillPicker({ open, onOpenChange }: SkillPickerProps): ReactNode {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const skills = useSkills();
  const [search, setSearch] = useState("");
  const sorted = useMemo(
    () => [...(skills.data ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [skills.data],
  );
  // The library's own search, as in the library and ⌘K: words in any order, name initials.
  const matches = useMemo(
    () => sorted.filter((skill) => matchesSkillQuery(skill, search)),
    [sorted, search],
  );
  const changeOpen = (next: boolean): void => {
    if (!next) setSearch("");
    onOpenChange(next);
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={changeOpen}
      filter={keepMatchedSkills}
      title={t("skillPicker.title")}
      description={t("skillPicker.description")}
    >
      <CommandInput
        placeholder={t("skillPicker.placeholder")}
        value={search}
        onValueChange={setSearch}
      />
      <CommandList>
        <CommandEmpty>
          {sorted.length === 0 ? t("skillPicker.noSkills") : t("skillPicker.empty")}
        </CommandEmpty>
        {matches.length > 0 ? (
          <CommandGroup heading={t("skillPicker.heading")}>
            {matches.map((skill) => (
              <CommandItem
                key={skill.id}
                value={`${MATCHED_SKILL_VALUE}${skill.name} ${skill.id}`}
                onSelect={() => {
                  changeOpen(false);
                  void navigate(editLink({ kind: "library", skillId: skill.id }));
                }}
              >
                <Package />
                <span className="shrink-0">{skill.name}</span>
                {skill.description ? (
                  <span className="truncate text-xs text-muted-foreground">
                    {skill.description}
                  </span>
                ) : null}
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
      </CommandList>
    </CommandDialog>
  );
}
