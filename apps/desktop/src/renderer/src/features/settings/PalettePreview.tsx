import type { PaletteSetting } from "@loadout/shared";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A thumbnail of the app in one palette and mode: rail, sidebar with a selected entry, a card
 * with a kit chip, and a primary button. It sets `data-theme` (and `dark`) on itself, so it is
 * drawn with that palette's real tokens whatever the window uses.
 */
function Thumbnail({ palette, dark }: { palette: PaletteSetting; dark: boolean }): ReactNode {
  return (
    <span
      data-theme={palette}
      aria-hidden="true"
      className={cn(
        "flex h-16 min-w-0 flex-1 overflow-hidden rounded-md border bg-background",
        dark && "dark",
      )}
    >
      <span className="flex w-3.5 shrink-0 flex-col items-center gap-1.5 border-r border-rail-border bg-rail pt-2">
        <span className="size-1.5 rounded-full bg-rail-indicator" />
        <span className="size-1.5 rounded-full bg-rail-foreground/50" />
        <span className="size-1.5 rounded-full bg-rail-foreground/50" />
      </span>
      <span className="flex w-10 shrink-0 flex-col gap-1 border-r border-sidebar-border bg-sidebar p-1.5">
        <span className="h-2 rounded-sm bg-selected" />
        <span className="h-1 w-3/4 rounded-sm bg-sidebar-foreground/30" />
        <span className="h-1 w-2/3 rounded-sm bg-sidebar-foreground/30" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1.5 p-1.5">
        <span className="flex items-center gap-1 rounded-sm border bg-card p-1 shadow-xs">
          <span className="h-1 flex-1 rounded-sm bg-foreground/55" />
          <span className="h-2 w-3.5 rounded-sm bg-kit/70" />
        </span>
        <span className="h-3 w-9 rounded-sm bg-primary" />
      </span>
    </span>
  );
}

/** The palette in light and in dark, side by side. */
export function PalettePreview({ palette }: { palette: PaletteSetting }): ReactNode {
  return (
    <span className="flex gap-2">
      <Thumbnail palette={palette} dark={false} />
      <Thumbnail palette={palette} dark />
    </span>
  );
}
