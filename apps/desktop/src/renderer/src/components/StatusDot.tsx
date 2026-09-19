import type { ReactNode } from "react";
import { type StatusTone, TONE_DOT_CLASSES } from "@/components/StatusBadge";
import { cn } from "@/lib/utils";

/** Small coloured dot with a screen-reader label and a hover title. */
export function StatusDot({
  tone,
  label,
  className,
}: {
  tone: StatusTone;
  label: string;
  className?: string;
}): ReactNode {
  return (
    <span
      title={label}
      className={cn(
        "inline-block size-1.5 shrink-0 rounded-full",
        TONE_DOT_CLASSES[tone],
        className,
      )}
    >
      <span className="sr-only">{label}</span>
    </span>
  );
}
