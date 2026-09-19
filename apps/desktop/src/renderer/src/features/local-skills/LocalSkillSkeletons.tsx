import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import type { ViewMode } from "@/lib/constants";
import { LOCAL_SKILL_GRID_CLASS, LOCAL_SKILL_LIST_CLASS } from "./LocalSkillCollection";

const PLACEHOLDERS = [0, 1, 2, 3, 4, 5];

/** Loading state shaped like the grid or the list it stands in for. */
export function LocalSkillSkeletons({ viewMode }: { viewMode: ViewMode }): ReactNode {
  const grid = viewMode === "grid";
  return (
    <div aria-hidden="true" className={grid ? LOCAL_SKILL_GRID_CLASS : LOCAL_SKILL_LIST_CLASS}>
      {PLACEHOLDERS.map((index) => (
        <Skeleton key={index} className={grid ? "h-40 rounded-lg" : "h-13 rounded-lg"} />
      ))}
    </div>
  );
}
