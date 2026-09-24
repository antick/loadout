import { Link, type LinkProps } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Kbd } from "@/components/ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface ActivityBarButtonProps {
  icon: ReactNode;
  label: string;
  /** The active entry: an accent bar on the left edge. */
  current?: boolean;
  /** Its section is what the sidebar shows right now: a filled background. */
  selected?: boolean;
  shortcut?: string;
  /** Small status dot over the icon's corner. */
  indicator?: ReactNode;
  /** A page to open; without it the button calls `onClick`. */
  link?: LinkProps;
  onClick?: () => void;
  /** `aria-pressed` for buttons that switch the sidebar section. */
  pressed?: boolean;
}

const BASE =
  "relative flex w-full flex-col items-center gap-1 rounded-lg px-0.5 py-1.5 text-rail-foreground transition-colors outline-none hover:bg-rail-hover hover:text-rail-active-foreground focus-visible:ring-2 focus-visible:ring-rail-indicator [&_svg]:size-[18px] [&_svg]:shrink-0";

/** One entry of the activity bar: an icon with a caption, a tooltip and its active states. */
export function ActivityBarButton({
  icon,
  label,
  current,
  selected,
  shortcut,
  indicator,
  link,
  onClick,
  pressed,
}: ActivityBarButtonProps): ReactNode {
  const className = cn(
    BASE,
    (current || selected) && "text-rail-active-foreground [&_svg]:text-rail-indicator",
    selected && "bg-rail-selected",
  );
  const body = (
    <>
      <span
        aria-hidden="true"
        className={cn(
          "absolute top-1/2 -left-1.5 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-rail-indicator shadow-[0_0_10px_1px_var(--rail-indicator)] transition-opacity",
          current ? "opacity-100" : "opacity-0",
        )}
      />
      <span className="relative">
        {icon}
        {indicator ? <span className="absolute -top-0.5 -right-1 flex">{indicator}</span> : null}
      </span>
      <span className="max-w-full truncate text-[0.625rem] leading-none font-medium">{label}</span>
    </>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {link ? (
          <Link
            {...link}
            draggable={false}
            aria-label={label}
            aria-current={current ? "page" : undefined}
            className={className}
          >
            {body}
          </Link>
        ) : (
          <button
            type="button"
            aria-label={label}
            aria-pressed={pressed}
            onClick={onClick}
            className={className}
          >
            {body}
          </button>
        )}
      </TooltipTrigger>
      <TooltipContent side="right" className="flex items-center gap-2">
        {label}
        {shortcut ? <Kbd>{shortcut}</Kbd> : null}
      </TooltipContent>
    </Tooltip>
  );
}
