import { defineConfig } from "astro/config";
import { SITE_URL } from "./src/lib/site.ts";

export default defineConfig({
  site: SITE_URL,
  output: "static",
  build: { format: "directory" },
  // Scripts ship as files, never inline, so the Content-Security-Policy can stay `script-src 'self'`.
  vite: { build: { assetsInlineLimit: 0 } },
});
