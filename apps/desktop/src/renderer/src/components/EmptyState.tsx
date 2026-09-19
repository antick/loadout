import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  /** One sentence. */
  description?: string;
  /** The one primary action. */
  action?: { label: string; onClick: () => void; icon?: LucideIcon };
  /** Anything beyond a single button (rare). */
  children?: ReactNode;
  className?: string;
}

/** The app's empty state: an icon, one sentence, one primary action. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  children,
  className,
}: EmptyStateProps): ReactNode {
  const ActionIcon = action?.icon;
  return (
    <Empty className={className}>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        {description ? <EmptyDescription>{description}</EmptyDescription> : null}
      </EmptyHeader>
      {action || children ? (
        <EmptyContent>
          {action ? (
            <Button size="sm" onClick={action.onClick}>
              {ActionIcon ? <ActionIcon /> : null}
              {action.label}
            </Button>
          ) : null}
          {children}
        </EmptyContent>
      ) : null}
    </Empty>
  );
}
