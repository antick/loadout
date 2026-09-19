import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface PanelProps {
  title?: string;
  /** One quiet sentence under the title. */
  description?: ReactNode;
  /** Right side of the heading: a badge, a switch, a button. */
  actions?: ReactNode;
  children?: ReactNode;
  /** `danger` tints the border for destructive areas. */
  tone?: "default" | "danger";
  className?: string;
  id?: string;
}

/** A bordered card with an optional heading. The building block of settings-like pages. */
export function Panel({
  title,
  description,
  actions,
  children,
  tone = "default",
  className,
  id,
}: PanelProps): ReactNode {
  return (
    <section
      id={id}
      className={cn(
        "flex flex-col gap-3 rounded-lg border bg-card p-4",
        tone === "danger" && "border-danger/30",
        className,
      )}
    >
      {title || actions ? (
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {title ? <h3 className="text-sm font-semibold tracking-tight">{title}</h3> : null}
            {description ? (
              <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}
