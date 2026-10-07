/**
 * `window.loadout` for the renderer in a plain browser: the preload bridge's three calls over
 * HTTP and server-sent events, answered by the real core in the dev server (`../plugin.ts`).
 * Injected into the page by that plugin only; the renderer never imports it.
 */
import type { AppEventName, PreloadBridge } from "@loadout/shared";
import { DEV_API_PREFIX, DEV_ROUTES, fromWire, toWire } from "../wire";

type Listener = (event: AppEventName, payload: unknown) => void;

const listeners = new Set<Listener>();
const events = new EventSource(`${DEV_API_PREFIX}${DEV_ROUTES.events}`);
const STREAM_REFUSED =
  "The preview's event stream was refused. Open the page at the address the dev server printed.";
// Calls wait for the event stream, so no change they cause can be announced before it listens.
const listening = new Promise<void>((resolve, reject) => {
  events.addEventListener("open", () => resolve(), { once: true });
  // Refused for good (another host name, say): every call fails with that, never waits forever.
  events.addEventListener("error", () => {
    if (events.readyState === EventSource.CLOSED) reject(new Error(STREAM_REFUSED));
  });
});
// Answered by each call; a page that makes none must not report it as unhandled.
listening.catch(() => undefined);
events.addEventListener("message", (message: MessageEvent<string>) => {
  const { event, payload } = fromWire(message.data) as { event: AppEventName; payload: unknown };
  for (const listener of listeners) listener(event, payload);
});

const bridge: PreloadBridge = {
  invoke: async (channel, args) => {
    await listening;
    const response = await fetch(`${DEV_API_PREFIX}${DEV_ROUTES.invoke}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: toWire({ channel, args }),
    });
    return fromWire(await response.text());
  },
  on: (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  // A browser never sees where a dropped file lives; its name is all there is.
  pathForFile: (file) => (file as File).name,
};

window.loadout = bridge;
