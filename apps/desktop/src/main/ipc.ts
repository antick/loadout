import { type BrowserWindow, ipcMain } from "electron";
import { toErrorShape } from "@loadout/core";
import {
  type ApiResponse,
  type AppEventName,
  type AppEvents,
  IPC_EVENT_CHANNEL,
  IPC_INVOKE_CHANNEL,
  type LoadoutApi,
} from "@loadout/shared";
import { callChannel } from "./dispatch";

/** One IPC entry point: `namespace.method` is looked up on the API object and called. */
export function registerIpc(
  api: LoadoutApi,
  onError: (channel: string, error: unknown) => void,
  /** Refuse a namespace for now (the library is gone): return the error to answer with. */
  refuse: (namespace: string) => Error | null = () => null,
  /** The page asking: only the app's own main frame may call the API. */
  isTrustedPage: (url: string) => boolean = () => true,
): void {
  ipcMain.handle(
    IPC_INVOKE_CHANNEL,
    async (event, channel: string, args: unknown[]): Promise<ApiResponse<unknown>> => {
      try {
        const frame = event.senderFrame;
        if (!frame || frame.parent !== null || !isTrustedPage(frame.url)) {
          throw new Error(`Refused an API call from ${frame?.url ?? "an unknown page"}`);
        }
        return { ok: true, value: await callChannel(api, channel, args, refuse) };
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
