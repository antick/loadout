import { HighlightStyle, type TagStyle, syntaxHighlighting } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";

/**
 * Editor colours taken from the app's CSS tokens, so light and dark mode follow the theme
 * switch without rebuilding the editor.
 */

const chrome = EditorView.theme({
  "&": {
    height: "100%",
    color: "var(--foreground)",
    backgroundColor: "var(--card)",
    fontSize: "0.8125rem",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    fontFamily: "var(--font-mono)",
    lineHeight: "1.6",
    overscrollBehavior: "contain",
  },
  ".cm-content": { padding: "0.75rem 0", caretColor: "var(--primary)" },
  ".cm-line": { padding: "0 1rem 0 0.75rem" },
  ".cm-gutters": {
    backgroundColor: "var(--card)",
    color: "color-mix(in oklab, var(--muted-foreground) 70%, transparent)",
    border: "none",
    paddingLeft: "0.5rem",
  },
  ".cm-lineNumbers .cm-gutterElement": { minWidth: "2.25rem", padding: "0 0.25rem" },
  ".cm-activeLine": { backgroundColor: "color-mix(in oklab, var(--muted) 55%, transparent)" },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--foreground)" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--primary)", borderLeftWidth: "2px" },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, ::selection":
    { backgroundColor: "color-mix(in oklab, var(--primary) 22%, transparent)" },
  ".cm-selectionMatch": { backgroundColor: "color-mix(in oklab, var(--info) 16%, transparent)" },
  ".cm-searchMatch": {
    backgroundColor: "color-mix(in oklab, var(--warning) 28%, transparent)",
    outline: "1px solid color-mix(in oklab, var(--warning) 60%, transparent)",
  },
  ".cm-searchMatch.cm-searchMatch-selected": {
    backgroundColor: "color-mix(in oklab, var(--warning) 50%, transparent)",
  },
  ".cm-matchingBracket, &.cm-focused .cm-matchingBracket": {
    backgroundColor: "color-mix(in oklab, var(--primary) 20%, transparent)",
    outline: "none",
  },
  ".cm-foldPlaceholder": {
    backgroundColor: "var(--muted)",
    border: "1px solid var(--border)",
    color: "var(--muted-foreground)",
  },
  ".cm-panels": {
    backgroundColor: "var(--popover)",
    color: "var(--popover-foreground)",
    fontFamily: "var(--font-sans)",
  },
  ".cm-panels.cm-panels-top": { borderBottom: "1px solid var(--border)" },
  ".cm-panels.cm-panels-bottom": { borderTop: "1px solid var(--border)" },
  ".cm-panel.cm-search": { padding: "0.5rem 0.75rem", fontSize: "0.8125rem" },
  ".cm-panel.cm-search input, .cm-panel.cm-search button": {
    fontFamily: "inherit",
    fontSize: "0.75rem",
    borderRadius: "calc(var(--radius) - 4px)",
  },
  ".cm-textfield": {
    backgroundColor: "var(--background)",
    border: "1px solid var(--input)",
    color: "var(--foreground)",
    padding: "0.125rem 0.375rem",
  },
  ".cm-button": {
    backgroundImage: "none",
    backgroundColor: "var(--secondary)",
    border: "1px solid var(--border)",
    color: "var(--secondary-foreground)",
    padding: "0.125rem 0.5rem",
  },
  ".cm-tooltip": {
    backgroundColor: "var(--popover)",
    border: "1px solid var(--border)",
    color: "var(--popover-foreground)",
    borderRadius: "calc(var(--radius) - 2px)",
  },
});

/** Token colours, shared by the editor and the code blocks of the Markdown preview. */
export const HIGHLIGHT_RULES: readonly TagStyle[] = [
  { tag: tags.heading1, fontWeight: "700", fontSize: "1.1em" },
  { tag: [tags.heading2, tags.heading3], fontWeight: "650" },
  { tag: [tags.heading4, tags.heading5, tags.heading6], fontWeight: "600" },
  { tag: tags.strong, fontWeight: "650" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: [tags.link, tags.url], color: "var(--syntax-link)" },
  { tag: tags.monospace, color: "var(--syntax-code)" },
  {
    tag: [tags.quote, tags.comment, tags.lineComment, tags.blockComment],
    color: "var(--syntax-comment)",
  },
  {
    tag: [tags.processingInstruction, tags.contentSeparator, tags.meta],
    color: "var(--syntax-comment)",
  },
  {
    tag: [tags.propertyName, tags.definition(tags.propertyName), tags.attributeName],
    color: "var(--syntax-property)",
  },
  {
    tag: [tags.keyword, tags.controlKeyword, tags.operatorKeyword, tags.modifier],
    color: "var(--syntax-keyword)",
  },
  { tag: [tags.string, tags.special(tags.string), tags.regexp], color: "var(--syntax-string)" },
  { tag: [tags.number, tags.bool, tags.null, tags.atom], color: "var(--syntax-number)" },
  {
    tag: [tags.function(tags.variableName), tags.function(tags.propertyName)],
    color: "var(--syntax-function)",
  },
  { tag: [tags.typeName, tags.className, tags.namespace], color: "var(--syntax-type)" },
  { tag: tags.tagName, color: "var(--syntax-keyword)" },
  { tag: tags.standard(tags.variableName), color: "var(--syntax-function)" },
  { tag: tags.inserted, color: "var(--syntax-inserted)" },
  { tag: tags.deleted, color: "var(--syntax-deleted)" },
  { tag: tags.invalid, color: "var(--syntax-deleted)" },
];

export const codeTheme: Extension = [
  chrome,
  syntaxHighlighting(HighlightStyle.define([...HIGHLIGHT_RULES])),
];
