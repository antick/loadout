import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface PageSectionProps {
  title?: string;
  description?: string;
  /** Right side of the section heading. */
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** A labelled block of a page: small uppercase label, optional actions, then content. */
export function PageSection({
  title,
  description,
  actions,
  children,
  className,
}: PageSectionProps): ReactNode {
  return (
    <section className={cn("flex flex-col gap-3", className)}>
      {title || actions ? (
        <header className="flex min-h-6 items-end justify-between gap-3">
          <div className="min-w-0">
            {title ? (
              <h2 className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
                {title}
              </h2>
            ) : null}
            {description ? (
              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}
