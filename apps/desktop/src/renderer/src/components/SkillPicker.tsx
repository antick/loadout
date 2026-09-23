import { useNavigate } from "@tanstack/react-router";
import { Package } from "lucide-react";
import { type ReactNode, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useSkills } from "@/hooks/queries/skills";
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
  const sorted = useMemo(
    () => [...(skills.data ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [skills.data],
  );

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("skillPicker.title")}
      description={t("skillPicker.description")}
    >
      <CommandInput placeholder={t("skillPicker.placeholder")} />
      <CommandList>
        <CommandEmpty>
          {sorted.length === 0 ? t("skillPicker.noSkills") : t("skillPicker.empty")}
        </CommandEmpty>
        {sorted.length > 0 ? (
          <CommandGroup heading={t("skillPicker.heading")}>
            {sorted.map((skill) => (
              <CommandItem
                key={skill.id}
                value={`${skill.name} ${skill.tags.join(" ")} ${skill.id}`}
                onSelect={() => {
                  onOpenChange(false);
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
