import type { CSSProperties } from "react";

const HUE_STEPS = 24;
const HUE_STEP_DEGREES = 360 / HUE_STEPS;
/** Lightness and chroma of the base tint; it is mixed with theme tokens so both themes look right. */
const TINT_BASE = "0.68 0.15";
const BACKGROUND_MIX_PERCENT = 20;
const FOREGROUND_MIX_PERCENT = 55;

/** Stable hue (0–359) for an agent key, snapped to a small wheel so neighbours stay distinct. */
export function agentHue(agentKey: string): number {
  let hash = 0;
  for (let i = 0; i < agentKey.length; i += 1) {
    hash = (hash * 31 + agentKey.charCodeAt(i)) >>> 0;
  }
  return Math.round((hash % HUE_STEPS) * HUE_STEP_DEGREES);
}

/** Inline tint for an agent monogram: a soft background and readable text in light and dark. */
export function agentTintStyle(agentKey: string): CSSProperties {
  const tint = `oklch(${TINT_BASE} ${agentHue(agentKey)})`;
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
