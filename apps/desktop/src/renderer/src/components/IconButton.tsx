import type { ComponentProps, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export interface IconButtonProps extends Omit<
  ComponentProps<typeof Button>,
  "aria-label" | "children"
> {
  /** Used as both the accessible name and the tooltip. */
  label: string;
  icon: ReactNode;
  tooltipSide?: ComponentProps<typeof TooltipContent>["side"];
}

/** Icon-only button that always carries an `aria-label` and a tooltip. */
export function IconButton({
  label,
  icon,
  tooltipSide,
  variant = "ghost",
  size = "icon-sm",
  ...props
}: IconButtonProps): ReactNode {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant={variant} size={size} aria-label={label} {...props}>
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent side={tooltipSide}>{label}</TooltipContent>
    </Tooltip>
  );
}
