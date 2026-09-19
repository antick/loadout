import { build } from "esbuild";

const OUT_FILE = "dist/skillboard.mjs";
const NODE_TARGET = "node22";
/**
 * Some dependencies are CommonJS and call `require("process")` and friends. An ES module has no
 * `require`, so the bundle gets a real one; without it the tool dies before its first line runs.
 */
const BANNER = [
  "#!/usr/bin/env node",
  'import { createRequire as __createRequire } from "node:module";',
  "const require = __createRequire(import.meta.url);",
].join("\n");

await build({
  entryPoints: ["src/bin.ts"],
  bundle: true,
  platform: "node",
  target: NODE_TARGET,
  format: "esm",
  outfile: OUT_FILE,
  banner: { js: BANNER },
  logLevel: "info",
});
