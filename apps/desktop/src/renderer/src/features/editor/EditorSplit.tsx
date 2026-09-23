import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ResizeHandle, type ResizeOrientation } from "@/components/ResizeHandle";
import { usePersistedState } from "@/hooks/use-persisted-state";
import {
  EDITOR_SPLIT_DEFAULT_PERCENT,
  EDITOR_SPLIT_MAX_PERCENT,
  EDITOR_SPLIT_MIN_PERCENT,
  EDITOR_SPLIT_STEP_PERCENT,
  type EditorView,
  STORAGE_KEYS,
} from "@/lib/constants";
import { clampTo, percentAfterDrag } from "@/lib/resize";
import { cn } from "@/lib/utils";

export interface EditorSplitProps {
  view: EditorView;
  editor: ReactNode;
  preview: ReactNode;
}

/**
 * The text and its preview, side by side or (in a narrow editor) stacked, with a draggable edge
 * between them whose position is remembered. Must sit inside an `@container`.
 */
export function EditorSplit({ view, editor, preview }: EditorSplitProps): ReactNode {
  const { t } = useTranslation();
  const boxRef = useRef<HTMLDivElement>(null);
  const [stored, setPercent] = usePersistedState(
    STORAGE_KEYS.editorSplit,
    EDITOR_SPLIT_DEFAULT_PERCENT,
  );
  // Anything odd in storage falls back into range rather than breaking the layout.
  const percent = clampTo(
    Number.isFinite(stored) ? stored : EDITOR_SPLIT_DEFAULT_PERCENT,
    EDITOR_SPLIT_MIN_PERCENT,
    EDITOR_SPLIT_MAX_PERCENT,
  );
  // The container query decides the layout; read it back so the edge drags along the right axis.
  const [stacked, setStacked] = useState(false);
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const measure = (): void => setStacked(getComputedStyle(box).flexDirection === "column");
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  const split = view === "split";
  const orientation: ResizeOrientation = stacked ? "horizontal" : "vertical";
  const size = (): number => {
    const rect = boxRef.current?.getBoundingClientRect();
    return (stacked ? rect?.height : rect?.width) ?? 0;
  };

  return (
    <div ref={boxRef} className="flex min-h-0 min-w-0 flex-1 @max-2xl:flex-col">
      {/* Kept mounted in preview mode so every file keeps its undo history. */}
      <div
        className={cn("min-h-0 min-w-0 flex-1", view === "preview" && "hidden")}
        // The text takes its share outright and the preview the rest, so the edge follows the pointer.
        style={split ? { flex: `0 0 ${percent}%` } : undefined}
      >
        {editor}
      </div>
      {split ? (
        <div className="relative shrink-0">
          <ResizeHandle
            orientation={orientation}
            value={percent}
            min={EDITOR_SPLIT_MIN_PERCENT}
            max={EDITOR_SPLIT_MAX_PERCENT}
            defaultValue={EDITOR_SPLIT_DEFAULT_PERCENT}
            step={EDITOR_SPLIT_STEP_PERCENT}
            fromDrag={(start, delta) => percentAfterDrag(start, delta, size())}
            onValue={setPercent}
            label={t("editor.view.resize")}
            className={
              stacked ? "absolute inset-x-0 -top-1.5 h-3" : "absolute inset-y-0 -left-1.5 w-3"
            }
          />
        </div>
      ) : null}
      {view !== "edit" ? (
        <div
          className={cn(
            "min-h-0 min-w-0 flex-1 overflow-y-auto bg-background px-6 py-5",
            split && "border-l @max-2xl:border-t @max-2xl:border-l-0",
          )}
        >
          {preview}
        </div>
      ) : null}
    </div>
  );
}
