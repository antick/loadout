import { ListChecks, Plus, RotateCw } from "lucide-react";
import { type ReactNode, useState } from "react";
import { IconButton } from "@/components/IconButton";
import { Button } from "@/components/ui/button";
import type { Selection } from "@/hooks/use-selection";

/**
 * The frame of a page around skills found on disk (an agent's folder or a project). The page
 * composes the rest: `PageHeader` with `RefreshButton`, `SelectButton` and `AddButton`, the
 * instruction files, presets, `LocalSkillToolbar`, `SelectionToolbar` and `LocalSkillList`.
 */
export function LocalSkillPage({ children }: { children: ReactNode }): ReactNode {
  return <div className="flex min-h-full flex-col gap-4 px-6 py-5">{children}</div>;
}

/** Top-bar Refresh: spins until `onRefresh` settles. */
export function RefreshButton({
  label,
  onRefresh,
  disabled,
}: {
  label: string;
  onRefresh: () => Promise<void>;
  disabled?: boolean;
}): ReactNode {
  const [refreshing, setRefreshing] = useState(false);
  const refresh = async (): Promise<void> => {
    setRefreshing(true);
    await onRefresh();
    setRefreshing(false);
  };
  return (
    <IconButton
      label={label}
      icon={
        <RotateCw className={refreshing ? "animate-spin motion-reduce:animate-none" : undefined} />
      }
      disabled={refreshing || disabled}
      onClick={() => void refresh()}
    />
  );
}

/** Top-bar Select: enters the selection, or leaves it when already in it. */
export function SelectButton({
  label,
  selection,
  disabled,
}: {
  label: string;
  selection: Selection;
  disabled?: boolean;
}): ReactNode {
  return (
    <Button
      size="sm"
      variant={selection.active ? "secondary" : "outline"}
      disabled={disabled}
      onClick={selection.active ? selection.exit : selection.enter}
    >
      <ListChecks />
      {label}
    </Button>
  );
}

/** Top-bar Add, the page's primary action. */
export function AddButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}): ReactNode {
  return (
    <Button size="sm" disabled={disabled} onClick={onClick}>
      <Plus />
      {label}
    </Button>
  );
}
