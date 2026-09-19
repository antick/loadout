import { type BrowserWindow, ipcMain } from "electron";
import { toErrorShape } from "@skillboard/core";
import {
  API_NAMESPACES,
  type ApiResponse,
  type AppEventName,
  type AppEvents,
  IPC_EVENT_CHANNEL,
  IPC_INVOKE_CHANNEL,
  type SkillboardApi,
} from "@skillboard/shared";

type Handler = (...args: unknown[]) => Promise<unknown>;

/** One IPC entry point: `namespace.method` is looked up on the API object and called. */
export function registerIpc(
  api: SkillboardApi,
  onError: (channel: string, error: unknown) => void,
): void {
  const namespaces = new Set<string>(API_NAMESPACES);
  ipcMain.handle(
    IPC_INVOKE_CHANNEL,
    async (_event, channel: string, args: unknown[]): Promise<ApiResponse<unknown>> => {
      try {
        const [namespace, method] = channel.split(".");
        if (!namespace || !method || !namespaces.has(namespace)) {
          throw new Error(`Unknown API channel: ${channel}`);
        }
        const group = api[namespace as keyof SkillboardApi] as unknown as Record<string, Handler>;
        const handler = Object.hasOwn(group, method) ? group[method] : undefined;
        if (typeof handler !== "function") throw new Error(`Unknown API channel: ${channel}`);
        return { ok: true, value: await handler.apply(group, Array.isArray(args) ? args : []) };
      } catch (error) {
        const shape = toErrorShape(error);
        if (shape.code === "INTERNAL") onError(channel, error);
        return { ok: false, error: shape };
      }
    },
  );
}

/** Push an event to every open window. */
export function createEventSender(windows: () => BrowserWindow[]) {
  return <K extends AppEventName>(event: K, payload: AppEvents[K]): void => {
    for (const win of windows()) {
      if (!win.isDestroyed()) win.webContents.send(IPC_EVENT_CHANNEL, event, payload);
    }
  };
}
