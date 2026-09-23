import { MoreHorizontal } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { IconButton } from "@/components/IconButton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { type SkillAction, splitActions } from "@/components/skill-action";

function menuEntry(action: SkillAction): ReactNode {
  const Icon = action.icon;
  return (
    <DropdownMenuItem
      key={action.id}
      variant={action.destructive ? "destructive" : "default"}
      onSelect={action.run}
    >
      <Icon />
      {action.label}
    </DropdownMenuItem>
  );
}

/** "More" menu with every action of one skill; destructive ones sit under a divider. */
export function SkillActionMenu({
  actions,
  name,
}: {
  actions: readonly SkillAction[];
  /** Skill name, for the button's accessible label. */
  name: string;
}): ReactNode {
  const { t } = useTranslation();
  if (actions.length === 0) return null;
  const { safe, destructive } = splitActions(actions);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton
          size="icon-xs"
          label={t("localSkills.actionsFor", { name })}
          icon={<MoreHorizontal />}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        {safe.map(menuEntry)}
        {safe.length > 0 && destructive.length > 0 ? <DropdownMenuSeparator /> : null}
        {destructive.map(menuEntry)}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
