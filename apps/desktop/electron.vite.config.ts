import { resolve } from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import { rendererConfig } from "./renderer.config";

// Workspace packages ship as TypeScript source, so they are bundled rather than externalized.
const WORKSPACE_PACKAGES = ["@loadout/core", "@loadout/shared"];
// Pure-JS runtime deps of the workspace packages are bundled too, so the packaged app needs no node_modules.
const BUNDLED_DEPS = [...WORKSPACE_PACKAGES, "yaml", "fflate"];

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
    ...rendererConfig,
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, "src/renderer/index.html") },
      },
    },
  },
});
