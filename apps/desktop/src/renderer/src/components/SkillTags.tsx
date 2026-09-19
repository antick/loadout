import type { ReactNode } from "react";
import { TagPill } from "@/components/TagPill";
import { SKILL_CARD_MAX_TAGS } from "@/lib/constants";
import { cn } from "@/lib/utils";

/** A skill's tags on one line, with the overflow folded into "+N". */
export function SkillTags({
  tags,
  max = SKILL_CARD_MAX_TAGS,
  className,
}: {
  tags: readonly string[];
  max?: number;
  className?: string;
}): ReactNode {
  if (tags.length === 0) return null;
  const hidden = tags.slice(max);
  return (
    <div className={cn("flex min-w-0 items-center gap-1 overflow-hidden", className)}>
      {tags.slice(0, max).map((tag) => (
        <TagPill key={tag} tag={tag} />
      ))}
      {hidden.length > 0 ? (
        <span title={hidden.join(", ")} className="shrink-0 text-xs text-muted-foreground">
          +{hidden.length}
        </span>
      ) : null}
    </div>
  );
}
