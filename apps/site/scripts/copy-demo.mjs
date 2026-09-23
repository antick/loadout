// Puts the desktop app's browser demo (built by `@loadout/desktop build:demo`) under /demo.
import { cpSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const siteDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const demoBuild = join(siteDir, "..", "desktop", "out", "demo");
const target = join(siteDir, "dist", "demo");

if (!existsSync(join(demoBuild, "index.html"))) {
  console.error(`No demo build at ${demoBuild}. Run: pnpm --filter @loadout/desktop build:demo`);
  process.exit(1);
}
cpSync(demoBuild, target, { recursive: true });
console.log(`Copied the demo to ${target}`);
