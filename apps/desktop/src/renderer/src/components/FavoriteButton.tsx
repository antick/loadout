import type { Skill } from "@loadout/shared";
import { Star } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { IconButton, type IconButtonProps } from "@/components/IconButton";
import { useSetFavorite } from "@/hooks/mutations/skills";
import { cn } from "@/lib/utils";

/** The star that makes a skill a favourite, filled while it is one. */
export function FavoriteButton({
  skill,
  size = "icon-xs",
  className,
}: {
  skill: Pick<Skill, "id" | "name" | "favoritedAt">;
  size?: IconButtonProps["size"];
  className?: string;
}): ReactNode {
  const { t } = useTranslation();
  const setFavorite = useSetFavorite();
  const on = skill.favoritedAt !== null;
  return (
    <IconButton
      size={size}
      label={t(on ? "library.favorites.remove" : "library.favorites.add", { name: skill.name })}
      aria-pressed={on}
      icon={<Star className={cn(on && "fill-current")} />}
      className={cn(on ? "text-primary hover:text-primary" : "text-muted-foreground", className)}
      onClick={() => setFavorite.mutate({ skillId: skill.id, favorite: !on })}
    />
  );
}
