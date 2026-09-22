import { Link, type LinkProps } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** Grid of cards on an overview page: as many columns as fit. */
export const CARD_GRID_CLASS = "grid grid-cols-[repeat(auto-fill,minmax(17rem,1fr))] gap-3";
const SKELETON_CARDS = [0, 1, 2, 3];

export interface LinkCardProps {
  link: LinkProps;
  /** Accessible name of the link that covers the card. */
  label: string;
  children: ReactNode;
  className?: string;
}

/**
 * A card that opens a page when clicked anywhere. Controls inside stay clickable when they
 * carry `SKILL_ITEM_RAISED_CLASS`, which lifts them above the covering link.
 */
export function LinkCard({ link, label, children, className }: LinkCardProps): ReactNode {
  return (
    <div
      className={cn(
        "relative flex flex-col gap-3 rounded-lg border bg-card p-4 transition-colors duration-150 hover:border-primary/40 hover:bg-accent/40",
        className,
      )}
    >
      <Link
        {...link}
        aria-label={label}
        className="absolute inset-0 rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      />
      {children}
    </div>
  );
}

/** Placeholder cards while an overview loads. */
export function CardGridSkeleton(): ReactNode {
  return (
    <div aria-hidden="true" className={CARD_GRID_CLASS}>
      {SKELETON_CARDS.map((card) => (
        <Skeleton key={card} className="h-32 rounded-lg" />
      ))}
    </div>
  );
}
