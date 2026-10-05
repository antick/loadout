import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";
import type { UserConfig } from "vite";

// Nothing is externalized on purpose: the workspace packages and every runtime dependency are
// bundled into out/, because the packaged app ships no node_modules (there are no `dependencies`).
// Pins the renderer dev server (browser preview, UI tests); vite picks a free port without it.
const RENDERER_PORT = Number(process.env.LOADOUT_RENDERER_PORT) || undefined;

/** The renderer on its own. The UI tests serve it with plain Vite (`e2e/vite.config.ts`). */
export const rendererConfig: UserConfig = {
  root: resolve(__dirname, "src/renderer"),
  server: { port: RENDERER_PORT, strictPort: RENDERER_PORT !== undefined },
  resolve: {
    alias: { "@": resolve(__dirname, "src/renderer/src") },
  },
  plugins: [
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
      routesDirectory: resolve(__dirname, "src/renderer/src/routes"),
      generatedRouteTree: resolve(__dirname, "src/renderer/src/routeTree.gen.ts"),
    }),
    react(),
    tailwindcss(),
  ],
  build: {
    rollupOptions: {
      input: { index: resolve(__dirname, "src/renderer/index.html") },
    },
  },
};

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, "src/main/index.ts"),
        },
      },
    },
  },
  preload: {
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, "src/preload/index.ts") },
        output: { format: "cjs", entryFileNames: "[name].cjs" },
      },
    },
  },
  renderer: rendererConfig,
});
