// The handle is a focusable separator with a value, per the ARIA window splitter pattern; an
// <hr> cannot be dragged or focused, so these two rules do not apply here.
/* oxlint-disable jsx-a11y/prefer-tag-over-role, jsx-a11y/no-noninteractive-tabindex */
import type { KeyboardEvent, PointerEvent, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { clampTo } from "@/lib/resize";
import { cn } from "@/lib/utils";

/** `vertical`: a line between side-by-side panels, dragged left and right. */
export type ResizeOrientation = "vertical" | "horizontal";

export interface ResizeHandleProps {
  orientation: ResizeOrientation;
  value: number;
  min: number;
  max: number;
  /** Where a double-click puts it back. */
  defaultValue: number;
  /** One arrow-key press moves the value by this much. */
  step: number;
  /** The value after a drag that started at `start` has moved `deltaPx` along its axis. */
  fromDrag(start: number, deltaPx: number): number;
  onValue(value: number): void;
  label: string;
  className?: string;
}

const KEY_DIRECTION: Record<ResizeOrientation, Record<string, number>> = {
  vertical: { ArrowLeft: -1, ArrowRight: 1 },
  horizontal: { ArrowUp: -1, ArrowDown: 1 },
};

/**
 * THE draggable edge between two panels: drag it, double-click to reset, or focus it and use the
 * arrow keys, Home and End. A thin line shows on hover so it can be found. Position it with
 * `className`; it fills its box and draws the line along the middle.
 */
export function ResizeHandle({
  orientation,
  value,
  min,
  max,
  defaultValue,
  step,
  fromDrag,
  onValue,
  label,
  className,
}: ResizeHandleProps): ReactNode {
  const { t } = useTranslation();
  const vertical = orientation === "vertical";
  const set = (next: number): void => onValue(clampTo(next, min, max));

  const startDrag = (event: PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return;
    event.preventDefault();
    const origin = vertical ? event.clientX : event.clientY;
    const start = value;
    document.body.dataset.resizing = vertical ? "col" : "row";
    const move = (next: globalThis.PointerEvent): void =>
      set(fromDrag(start, (vertical ? next.clientX : next.clientY) - origin));
    const stop = (): void => {
      delete document.body.dataset.resizing;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const direction = KEY_DIRECTION[orientation][event.key] ?? 0;
    if (direction !== 0) {
      event.preventDefault();
      set(value + direction * step);
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      set(event.key === "Home" ? min : max);
    }
  };

  return (
    <div
      role="separator"
      aria-orientation={orientation}
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      title={t("common.resizeHint")}
      onPointerDown={startDrag}
      onDoubleClick={() => set(defaultValue)}
      onKeyDown={onKeyDown}
      className={cn(
        "group/resize z-20 outline-none",
        vertical ? "cursor-col-resize" : "cursor-row-resize",
        className,
      )}
    >
      <span
        className={cn(
          "absolute bg-transparent transition-colors group-hover/resize:bg-primary/60 group-focus-visible/resize:bg-primary group-active/resize:bg-primary",
          vertical
            ? "inset-y-0 left-1/2 w-px -translate-x-1/2"
            : "inset-x-0 top-1/2 h-px -translate-y-1/2",
        )}
      />
    </div>
  );
}
