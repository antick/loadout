import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const OUT_FILE = "dist/loadout.mjs";
const NODE_TARGET = "node22";
/**
 * Some dependencies are CommonJS and call `require("process")` and friends. An ES module has no
 * `require`, so the bundle gets a real one; without it the tool dies before its first line runs.
 */
const ESM_BANNER = [
  "#!/usr/bin/env node",
  'import { createRequire as __createRequire } from "node:module";',
  "const require = __createRequire(import.meta.url);",
].join("\n");

/**
 * The one way the CLI is bundled, as the published ES module or as the CommonJS file a standalone
 * binary embeds (`scripts/standalone.mjs`), so the two never drift apart.
 */
export function bundleOptions(format, outfile) {
  return {
    entryPoints: ["src/bin.ts"],
    bundle: true,
    minify: true,
    platform: "node",
    target: NODE_TARGET,
    format,
    outfile,
    ...(format === "esm" ? { banner: { js: ESM_BANNER } } : {}),
    logLevel: "info",
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await build(bundleOptions("esm", OUT_FILE));
}
