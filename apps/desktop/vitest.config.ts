import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

// Same `@` alias as the renderer build, so tested modules import the way the app does.
export default defineConfig({
  resolve: { alias: { "@": resolve(import.meta.dirname, "src/renderer/src") } },
});
