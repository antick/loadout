import { Ban, Check, Plus } from "lucide-react";
import type { ReactNode } from "react";
import { Spinner } from "@/components/ui/spinner";
import type { MatrixCellState } from "@/features/library/matrix/matrix-state";
import { cn } from "@/lib/utils";

const FOCUS_RING = "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

const STATE_CLASSES: Record<MatrixCellState, string> = {
  deployed: "bg-success/15 text-success hover:bg-success/25",
  pending: "bg-success/10 text-success",
  blocked: "text-danger/70",
  empty: "border border-dashed text-transparent hover:border-solid hover:text-muted-foreground",
};

export interface MatrixCellProps {
  state: MatrixCellState;
  /** Names the skill and the agent, for screen readers and the hover text. */
  label: string;
  skillId: string;
  agentKey: string;
  onToggle: () => void;
}

/**
 * One skill × agent square. Click to deploy or remove; a blocked one does nothing, but stays
 * focusable, since its right-click menu (or the context-menu key) is where it is allowed again.
 */
export function MatrixCell({
  state,
  label,
  skillId,
  agentKey,
  onToggle,
}: MatrixCellProps): ReactNode {
  return (
    <button
      type="button"
      data-skill={skillId}
      data-agent={agentKey}
      title={label}
      aria-label={label}
      aria-pressed={state === "deployed" || state === "pending"}
      disabled={state === "pending"}
      aria-disabled={state === "blocked" || undefined}
      onClick={state === "blocked" ? undefined : onToggle}
      className={cn(
        "mx-auto flex size-7 items-center justify-center rounded-md transition-colors disabled:cursor-default aria-disabled:cursor-default",
        STATE_CLASSES[state],
        FOCUS_RING,
      )}
    >
      {state === "deployed" ? <Check className="size-4" /> : null}
      {state === "pending" ? <Spinner className="size-3.5" /> : null}
      {state === "blocked" ? <Ban className="size-3.5" /> : null}
      {state === "empty" ? <Plus className="size-3.5" /> : null}
    </button>
  );
}
