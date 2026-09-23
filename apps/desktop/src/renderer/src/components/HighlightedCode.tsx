import { type ReactNode, useMemo } from "react";
import { languageForFence } from "@/features/editor/code-languages";
import { highlightCode } from "@/features/editor/highlight-code";

export interface HighlightedCodeProps {
  code: string;
  /** The code fence's info string, e.g. `ts` or `bash`. */
  language: string;
  className?: string;
}

/** A code block coloured the way the editor colours it. Unknown languages stay plain. */
export function HighlightedCode({ code, language, className }: HighlightedCodeProps): ReactNode {
  const tokens = useMemo(() => highlightCode(code, languageForFence(language)), [code, language]);
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
