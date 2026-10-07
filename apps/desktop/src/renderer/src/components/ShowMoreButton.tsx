import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ShowMoreButtonProps {
  expanded: boolean;
  /** Rows left out while folded; nothing is shown when there are none and it is folded. */
  hidden: number;
  onToggle: () => void;
  /** What the folded button says, when "Show N more" is not the clearest. */
  moreLabel?: string;
  className?: string;
}

/** "Show N more" under a short list, and "Show fewer" once it is open. */
export function ShowMoreButton({
  expanded,
  hidden,
  onToggle,
  moreLabel,
  className,
}: ShowMoreButtonProps): ReactNode {
  const { t } = useTranslation();
  if (hidden <= 0 && !expanded) return null;
  return (
    <Button
      size="xs"
      variant="link"
      className={cn("h-auto self-start px-0 text-muted-foreground", className)}
      onClick={onToggle}
    >
      {expanded ? t("common.showFewer") : (moreLabel ?? t("common.showMore", { count: hidden }))}
    </Button>
  );
}
