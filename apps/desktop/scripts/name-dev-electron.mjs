#!/usr/bin/env node
// Development only: macOS shows the menu-bar name from the running app bundle, which for
// `pnpm dev` is Electron's own. This renames that bundle (inside node_modules) to Loadout.
// Packaged builds are named by electron-builder and need nothing. Safe to run again.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const APP_NAME = "Loadout";

if (process.platform === "darwin") {
  const require = createRequire(import.meta.url);
  const plist = join(
    dirname(require.resolve("electron")),
    "dist",
    "Electron.app",
    "Contents",
    "Info.plist",
  );
  if (existsSync(plist)) {
    for (const key of ["CFBundleName", "CFBundleDisplayName"]) {
      execFileSync("plutil", ["-replace", key, "-string", APP_NAME, plist]);
    }
  }
}
