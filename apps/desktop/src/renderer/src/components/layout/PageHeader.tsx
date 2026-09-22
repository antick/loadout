import { Link, type LinkProps } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { type ReactNode, useContext, useEffect } from "react";
import { createPortal } from "react-dom";
import { APP_NAME } from "@loadout/shared";
import { PageHeaderSlotsContext } from "@/components/layout/shell-context";

export interface PageCrumb {
  label: string;
  to: LinkProps["to"];
  params?: LinkProps["params"];
}

export interface PageHeaderProps {
  title: string;
  /** Quiet text after the title: a count, a path, a status. */
  subtitle?: ReactNode;
  /** Parent pages, shown before the title. */
  breadcrumbs?: readonly PageCrumb[];
  /** Buttons for the right side of the top bar. They are made clickable inside the drag region. */
  actions?: ReactNode;
}

/**
 * THE way a page sets its title and top-bar actions. Render it anywhere in the page; it draws
 * nothing in place and portals into the top bar instead, so state and handlers stay in the page.
 * Also sets the window title.
 */
export function PageHeader({ title, subtitle, breadcrumbs, actions }: PageHeaderProps): ReactNode {
  const slots = useContext(PageHeaderSlotsContext);

  useEffect(() => {
    document.title = `${title} · ${APP_NAME}`;
    return () => {
      document.title = APP_NAME;
    };
  }, [title]);

  return (
    <>
      {slots.title
        ? createPortal(
            <div className="flex min-w-0 items-baseline gap-2">
              {breadcrumbs?.map((crumb) => (
                <span
                  key={crumb.label}
                  className="app-no-drag flex shrink-0 items-center gap-2 text-sm text-muted-foreground"
                >
                  <Link
                    to={crumb.to}
                    params={crumb.params}
                    className="rounded hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    {crumb.label}
                  </Link>
                  <ChevronRight className="size-3.5 self-center" />
                </span>
              ))}
              <h1 className="truncate text-[0.9375rem] font-semibold tracking-tight">{title}</h1>
              {subtitle ? (
                <span className="truncate text-[0.8125rem] text-muted-foreground">{subtitle}</span>
              ) : null}
            </div>,
            slots.title,
          )
        : null}
      {slots.actions && actions ? createPortal(actions, slots.actions) : null}
    </>
  );
}
