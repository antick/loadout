import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("skillboard", { ping: () => "pong" });
