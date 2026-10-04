/**
 * What the browser preview sends over HTTP: JSON that keeps `undefined`, so an argument left out
 * reaches core the way Electron's IPC would pass it, and a default parameter still applies.
 */
const UNDEFINED_TAG = "$undefined";

export const DEV_API_PREFIX = "/__loadout";
export const DEV_SESSION_COOKIE = "loadout-session";
/** The session of a browser without the cookie: the one-command preview. */
export const DEV_DEFAULT_SESSION = "preview";
export const DEV_ROUTES = {
  invoke: "/invoke",
  events: "/events",
  reset: "/reset",
  setup: "/setup",
} as const;

export function toWire(value: unknown): string {
  return JSON.stringify(value, (_key, entry: unknown) =>
    entry === undefined ? { [UNDEFINED_TAG]: true } : entry,
  );
}

export function fromWire(text: string): unknown {
  return JSON.parse(text, (_key, entry: unknown) =>
    entry !== null && typeof entry === "object" && UNDEFINED_TAG in entry ? undefined : entry,
  );
}
