import { rendererConfig } from "../electron.vite.config";

// Serves only the renderer, so the UI tests run in a plain browser on the in-memory preview bridge
// (`lib/dev-mock.ts`) and never start Electron. `electron-vite dev --rendererOnly` would.
export default rendererConfig;
