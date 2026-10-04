import type { UserConfig } from "vite";
import { loadoutDevServer } from "../dev-server/plugin";
import { rendererConfig } from "../electron.vite.config";

// Serves only the renderer, in a plain browser, on the real core: the dev server plugin runs it
// on a seeded temporary home. Electron never starts. Used by the UI tests and the preview.
const config: UserConfig = {
  ...rendererConfig,
  plugins: [...(rendererConfig.plugins ?? []), loadoutDevServer()],
};

export default config;
