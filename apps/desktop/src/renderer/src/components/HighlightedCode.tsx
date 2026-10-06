import { type ReactNode, useEffect, useMemo, useState } from "react";
import type { CodeToken } from "@/features/editor/highlight-code";

export interface HighlightedCodeProps {
  code: string;
  /** The code fence's info string, e.g. `ts` or `bash`. */
  language: string;
  className?: string;
}

type Highlighter = (code: string, fence: string) => CodeToken[];

let highlighter: Highlighter | null = null;
let loading: Promise<Highlighter> | null = null;

/**
 * The editor's parsers and colours, loaded the first time a code block shows: they are most of
 * the editor's weight, and pages with a Markdown preview should not wait for them.
 */
function loadHighlighter(): Promise<Highlighter> {
  loading ??= Promise.all([
    import("@/features/editor/code-languages"),
    import("@/features/editor/highlight-code"),
  ]).then(([languages, highlight]) => {
    highlighter = (code, fence) => highlight.highlightCode(code, languages.languageForFence(fence));
    return highlighter;
  });
  return loading;
}

/**
 * A code block coloured the way the editor colours it, plain until the colouring has loaded.
 * Unknown languages stay plain.
 */
export function HighlightedCode({ code, language, className }: HighlightedCodeProps): ReactNode {
  const [highlight, setHighlight] = useState<Highlighter | null>(() => highlighter);
  useEffect(() => {
    if (highlight) return;
    let current = true;
    void loadHighlighter().then((loaded) => {
      if (current) setHighlight(() => loaded);
    });
    return () => {
      current = false;
    };
  }, [highlight]);

  const tokens = useMemo<CodeToken[]>(
    () => (highlight ? highlight(code, language) : [{ text: code, style: null }]),
    [highlight, code, language],
  );
  return (
    <code className={className}>
      {tokens.map((token, index) =>
        token.style ? (
          // Tokens have no identity of their own; their order never changes for one render.
          // oxlint-disable-next-line react/no-array-index-key
          <span key={index} style={token.style}>
            {token.text}
          </span>
        ) : (
          token.text
        ),
      )}
    </code>
  );
}
