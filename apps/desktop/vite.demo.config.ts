import { resolve } from "node:path";
import { defineConfig } from "vite";
import { rendererConfig } from "./renderer.config";

/**
 * The renderer on its own, in a plain browser, answering from the in-memory mock instead of the
 * main process. `pnpm demo` serves it for previews; `pnpm build:demo` builds the web demo.
 */
export default defineConfig({
  ...rendererConfig,
  base: "./",
  define: { "import.meta.env.VITE_LOADOUT_DEMO": JSON.stringify("1") },
  build: {
    outDir: resolve(__dirname, "out/demo"),
    emptyOutDir: true,
  },
});
