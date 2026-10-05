import type { ClientRect, Modifier } from "@dnd-kit/core";

type Transform = Parameters<Modifier>[0]["transform"];

/** Rows only move up and down. */
export const restrictToVerticalAxis: Modifier = ({ transform }) => ({ ...transform, x: 0 });

/** Keep the dragged row's box inside `bounds`. */
function keepInside(transform: Transform, rect: ClientRect, bounds: ClientRect): Transform {
  const value = { ...transform };
  if (rect.top + transform.y <= bounds.top) value.y = bounds.top - rect.top;
  else if (rect.bottom + transform.y >= bounds.top + bounds.height) {
    value.y = bounds.top + bounds.height - rect.bottom;
  }
  if (rect.left + transform.x <= bounds.left) value.x = bounds.left - rect.left;
  else if (rect.right + transform.x >= bounds.left + bounds.width) {
    value.x = bounds.left + bounds.width - rect.right;
  }
  return value;
}

/** Rows never leave the list they belong to. */
export const restrictToParentElement: Modifier = ({
  containerNodeRect,
  draggingNodeRect,
  transform,
}) =>
  draggingNodeRect && containerNodeRect
    ? keepInside(transform, draggingNodeRect, containerNodeRect)
    : transform;

/** The CSS `transform` for a drag offset, whole pixels; undefined when the row is not moved. */
export function translateCss(transform: Pick<Transform, "x" | "y"> | null): string | undefined {
  if (!transform) return undefined;
  return `translate3d(${Math.round(transform.x) || 0}px, ${Math.round(transform.y) || 0}px, 0)`;
}
