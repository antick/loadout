/**
 * Text a repository supplies (names, descriptions, `SKILL.md`) can hold escape sequences that move
 * the cursor, rewrite the screen, change the window title or reach the clipboard once printed to a
 * terminal. Every control character is shown as a space instead; multi-line text keeps its line
 * breaks and tabs.
 */

const REPLACEMENT = " ";
const TAB = 0x09;
const LINE_FEED = 0x0a;

/** C0 controls (ESC among them), DEL and the C1 controls. */
const isControl = (code: number): boolean => code <= 0x1f || (code >= 0x7f && code <= 0x9f);

export function terminalSafe(text: string, options: { singleLine?: boolean } = {}): string {
  let out = "";
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    const layout = !options.singleLine && (code === LINE_FEED || code === TAB);
    out += isControl(code) && !layout ? REPLACEMENT : ch;
  }
  return out;
}
