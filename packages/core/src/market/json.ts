import { isRecord } from "@loadout/shared";

/** Reading the loosely shaped JSON the marketplaces answer with: a field or nothing, never a throw. */

export type Json = Record<string, unknown>;

/** `value` as an object, or an empty one. */
export function asObject(value: unknown): Json {
  return isRecord(value) ? value : {};
}

/** `value` when it is a string, else null. */
export function asText(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/** `value` trimmed when it is a string with something in it, else null. */
export function asTrimmedText(value: unknown): string | null {
  const text = asText(value)?.trim();
  return text ? text : null;
}

/** `value` when it is a finite number, else null. */
export function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
