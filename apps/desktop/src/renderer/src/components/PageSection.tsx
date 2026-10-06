import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { SECTION_LABEL } from "@/lib/styles";

export interface PageSectionProps {
  title?: string;
  /** One quiet sentence under the title. */
  description?: ReactNode;
  /** Right side of the heading: a badge, a switch, a button. */
  actions?: ReactNode;
  children?: ReactNode;
  /**
   * `plain`: a labelled block of a page, small uppercase label. `card`: a bordered card with a
   * title, the building block of settings-like pages.
   */
  variant?: "plain" | "card";
  /** `danger` tints a card's border for destructive areas. */
  tone?: "default" | "danger";
  className?: string;
  id?: string;
}

/** A block of a page: an optional heading with actions, then content, plain or as a card. */
export function PageSection({
  title,
  description,
  actions,
  children,
  variant = "plain",
  tone = "default",
  className,
  id,
}: PageSectionProps): ReactNode {
  const card = variant === "card";
  return (
    <section
      id={id}
      className={cn(
        "flex flex-col gap-3",
        card && "rounded-lg border bg-card p-4",
        card && tone === "danger" && "border-danger/30",
        className,
      )}
    >
      {title || actions ? (
        <header
          className={cn("flex justify-between gap-3", card ? "items-start" : "min-h-6 items-end")}
        >
          <div className="min-w-0">
            {title ? (
              card ? (
                <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
              ) : (
                <h2 className={SECTION_LABEL}>{title}</h2>
              )
            ) : null}
            {description ? (
              <p className={cn("text-sm text-muted-foreground", card ? "mt-0.5" : "mt-1")}>
                {description}
              </p>
            ) : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}
