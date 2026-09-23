import { highlightCode as walkHighlights, tagHighlighter } from "@lezer/highlight";
import type { CSSProperties } from "react";
import type { CodeLanguage } from "@/features/editor/code-languages";
import { HIGHLIGHT_RULES } from "@/features/editor/code-theme";

/** A run of code text and the colours the editor would give it (null: plain text). */
export interface CodeToken {
  text: string;
  style: CSSProperties | null;
}

const CLASS_PREFIX = "hl";

/** One class per colour rule, so a token's classes lead straight back to its styles. */
const highlighter = tagHighlighter(
  HIGHLIGHT_RULES.map((rule, index) => ({ tag: rule.tag, class: `${CLASS_PREFIX}${index}` })),
);

const STYLES: readonly CSSProperties[] = HIGHLIGHT_RULES.map(
  ({ tag: _tag, ...style }) => style as CSSProperties,
);

function styleOf(classes: string): CSSProperties | null {
  if (!classes) return null;
  const merged: CSSProperties = {};
  for (const name of classes.split(" ")) {
    Object.assign(merged, STYLES[Number(name.slice(CLASS_PREFIX.length))]);
  }
  return merged;
}

/**
 * Split code into coloured runs with the editor's parser and colours, for read-only views such as
 * the Markdown preview. Plain text comes back as one uncoloured run.
 */
export function highlightCode(code: string, language: CodeLanguage): CodeToken[] {
  const support = language.support();
  if (!support) return [{ text: code, style: null }];
  const tokens: CodeToken[] = [];
  walkHighlights(
    code,
    support.language.parser.parse(code),
    highlighter,
    (text, classes) => tokens.push({ text, style: styleOf(classes) }),
    () => tokens.push({ text: "\n", style: null }),
  );
  return tokens;
}
