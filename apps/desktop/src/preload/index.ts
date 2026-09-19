import { contextBridge, ipcRenderer } from "electron";
import {
  type AppEventName,
  IPC_EVENT_CHANNEL,
  IPC_INVOKE_CHANNEL,
  type PreloadBridge,
} from "@skillboard/shared";

const bridge: PreloadBridge = {
  invoke: (channel, args) => ipcRenderer.invoke(IPC_INVOKE_CHANNEL, channel, args),
  on: (listener) => {
    const handler = (_event: unknown, name: AppEventName, payload: unknown): void =>
      listener(name, payload);
    ipcRenderer.on(IPC_EVENT_CHANNEL, handler);
    return () => ipcRenderer.removeListener(IPC_EVENT_CHANNEL, handler);
  },
};

contextBridge.exposeInMainWorld("skillboard", bridge);
