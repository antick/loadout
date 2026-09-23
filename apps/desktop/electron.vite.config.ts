import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";

// Workspace packages ship as TypeScript source, so they are bundled rather than externalized.
const WORKSPACE_PACKAGES = ["@loadout/core", "@loadout/shared"];
// Pure-JS runtime deps of the workspace packages are bundled too, so the packaged app needs no node_modules.
const BUNDLED_DEPS = [...WORKSPACE_PACKAGES, "yaml", "fflate"];
// Pins the renderer dev server (`--rendererOnly` browser preview); vite picks a free port without it.
const RENDERER_PORT = Number(process.env.LOADOUT_RENDERER_PORT) || undefined;

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: BUNDLED_DEPS })],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, "src/main/index.ts"),
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: WORKSPACE_PACKAGES })],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, "src/preload/index.ts") },
        output: { format: "cjs", entryFileNames: "[name].cjs" },
      },
    },
  },
  renderer: {
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
  },
});
