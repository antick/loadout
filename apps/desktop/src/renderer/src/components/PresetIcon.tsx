import type { ReactNode } from "react";
import { TONE_CLASSES } from "@/components/StatusBadge";
import { resolvePresetIcon } from "@/lib/preset-icons";
import { cn } from "@/lib/utils";

export type PresetIconSize = "sm" | "md" | "lg";

const SIZE_CLASSES: Record<PresetIconSize, string> = {
  sm: "size-5 rounded [&_svg]:size-3",
  md: "size-7 rounded-md [&_svg]:size-4",
  lg: "size-10 rounded-lg [&_svg]:size-5",
};

/** A preset's icon on its tint. Unknown ids show the default icon. */
export function PresetIcon({
  icon,
  size = "md",
  className,
}: {
  icon: string | null | undefined;
  size?: PresetIconSize;
  className?: string;
}): ReactNode {
  const { icon: Icon, tone } = resolvePresetIcon(icon);
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center",
        SIZE_CLASSES[size],
        TONE_CLASSES[tone],
        className,
      )}
    >
      <Icon />
    </span>
  );
}
