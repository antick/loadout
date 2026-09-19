import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface SettingRowProps {
  label: string;
  /** What the setting does, in a sentence or two. */
  description?: ReactNode;
  /** Id of the control, so clicking the label focuses it. */
  htmlFor?: string;
  /** The control: a switch, a select, a button. */
  children: ReactNode;
  /** Put the control under the text instead of beside it (wide inputs). */
  stacked?: boolean;
  className?: string;
}

/** One setting: label and explanation on the left, its control on the right. */
export function SettingRow({
  label,
  description,
  htmlFor,
  children,
  stacked,
  className,
}: SettingRowProps): ReactNode {
  return (
    <div
      className={cn(
        "flex gap-x-6 gap-y-2 py-3 first:pt-0 last:pb-0",
        stacked ? "flex-col" : "items-start justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        <label htmlFor={htmlFor} className="text-sm font-medium">
          {label}
        </label>
        {description ? <p className="mt-0.5 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      <div className={cn("flex items-center gap-2", stacked ? "w-full" : "shrink-0")}>
        {children}
      </div>
    </div>
  );
}
