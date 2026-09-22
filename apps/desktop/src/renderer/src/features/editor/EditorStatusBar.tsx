import type { LineEnding } from "@loadout/shared";
import { PanelLeft, WrapText } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { CursorPosition } from "@/features/editor/CodeEditor";
import { cn } from "@/lib/utils";

export type SaveState = "saved" | "unsaved" | "saving";

export interface EditorStatusBarProps {
  cursor: CursorPosition | null;
  /** Null while no file is open. */
  languageLabel: string | null;
  eol: LineEnding | null;
  state: SaveState;
  wrap: boolean;
  onToggleWrap(): void;
  filesOpen: boolean;
  onToggleFiles(): void;
}

function BarButton({
  label,
  pressed,
  onClick,
  children,
}: {
  label: string;
  pressed: boolean;
  onClick(): void;
  children: ReactNode;
}): ReactNode {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          aria-pressed={pressed}
          onClick={onClick}
          className={cn(
            "inline-flex h-5 items-center gap-1 rounded px-1.5 transition-colors hover:bg-accent hover:text-foreground",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&_svg]:size-3.5",
            pressed && "text-foreground",
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}

/** One quiet line under the editor: files panel, cursor, save state, file type and wrapping. */
export function EditorStatusBar({
  cursor,
  languageLabel,
  eol,
  state,
  wrap,
  onToggleWrap,
  filesOpen,
  onToggleFiles,
}: EditorStatusBarProps): ReactNode {
  const { t } = useTranslation();
  return (
    <footer className="flex h-7 shrink-0 items-center gap-3 border-t bg-background px-2 text-xs text-muted-foreground">
      <BarButton label={t("editor.status.files")} pressed={filesOpen} onClick={onToggleFiles}>
        <PanelLeft />
      </BarButton>
      {cursor ? (
        <span className="tabular-nums">
          {t("editor.status.cursor", { line: cursor.line, column: cursor.column })}
          {cursor.selected > 0
            ? ` · ${t("editor.status.selected", { count: cursor.selected })}`
            : ""}
        </span>
      ) : null}
      <span className="flex-1" />
      <output aria-live="polite" className="inline-flex items-center gap-1.5">
        {state === "saving" ? <Spinner className="size-3" /> : null}
        {state === "unsaved" ? <span className="size-1.5 rounded-full bg-warning" /> : null}
        {t(`editor.status.${state}`)}
      </output>
      {languageLabel ? <span>{languageLabel}</span> : null}
      {eol ? <span className="font-mono uppercase">{eol}</span> : null}
      <BarButton label={t("editor.status.wrap")} pressed={wrap} onClick={onToggleWrap}>
        <WrapText />
      </BarButton>
    </footer>
  );
}
