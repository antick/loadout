import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import type { UserConfig } from "vite";

/** Renderer settings shared by the Electron build and the browser demo build. */
export const rendererConfig = {
  root: resolve(__dirname, "src/renderer"),
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
} satisfies UserConfig;
