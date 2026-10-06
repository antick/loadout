import type { ReactNode } from "react";
import { Skeletons } from "@/components/Skeletons";
import type { ViewMode } from "@/lib/constants";
import { LOCAL_SKILL_LIST_CLASS } from "./LocalSkillCollection";
import { LOCAL_SKILL_GRID_CLASS } from "@/lib/styles";

const PLACEHOLDERS = 6;

/** Loading state shaped like the grid or the list it stands in for. */
export function LocalSkillSkeletons({ viewMode }: { viewMode: ViewMode }): ReactNode {
  const grid = viewMode === "grid";
  return (
    <div aria-hidden="true" className={grid ? LOCAL_SKILL_GRID_CLASS : LOCAL_SKILL_LIST_CLASS}>
      <Skeletons count={PLACEHOLDERS} className={grid ? "h-40 rounded-lg" : "h-13 rounded-lg"} />
    </div>
  );
}
