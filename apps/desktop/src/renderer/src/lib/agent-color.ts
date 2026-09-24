import type { CSSProperties } from "react";

/** Agent colours are the `--agent-1` … `--agent-8` tokens in globals.css. */
export const AGENT_TINT_COUNT = 8;
/** How much of the tint goes into the monogram's background and text; the rest is theme tokens. */
const BACKGROUND_MIX_PERCENT = 20;
const FOREGROUND_MIX_PERCENT = 60;

/** Stable tint (1 to AGENT_TINT_COUNT) for an agent key. */
export function agentTintIndex(agentKey: string): number {
  let hash = 0;
  for (let i = 0; i < agentKey.length; i += 1) {
    hash = (hash * 31 + agentKey.charCodeAt(i)) >>> 0;
  }
  return (hash % AGENT_TINT_COUNT) + 1;
}

/** Inline tint for an agent monogram: a soft background and readable text in light and dark. */
export function agentTintStyle(agentKey: string): CSSProperties {
  const tint = `var(--agent-${agentTintIndex(agentKey)})`;
  return {
    backgroundColor: `color-mix(in oklab, ${tint} ${BACKGROUND_MIX_PERCENT}%, var(--card))`,
    color: `color-mix(in oklab, ${tint} ${FOREGROUND_MIX_PERCENT}%, var(--foreground))`,
  };
}

/** One or two letters for an agent: initials of the first two words, else the first two letters. */
export function agentMonogram(displayName: string): string {
  const words = displayName
    .trim()
    .split(/[\s_-]+/)
    .filter(Boolean);
  const first = words[0] ?? "";
  const second = words[1];
  const letters = second ? `${first.charAt(0)}${second.charAt(0)}` : first.slice(0, 2);
  return letters.toUpperCase() || "?";
}
