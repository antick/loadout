#!/usr/bin/env node
// Development only: macOS shows the menu-bar name from the running app bundle, which for
// `pnpm dev` is Electron's own. This renames that bundle (inside node_modules) to Loadout.
// Packaged builds are named by electron-builder and need nothing. Safe to run again.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const identity = JSON.parse(
  readFileSync(new URL("../../../packages/shared/src/app-identity.json", import.meta.url), "utf8"),
);

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
      execFileSync("plutil", ["-replace", key, "-string", identity.developmentName, plist]);
    }
    execFileSync("plutil", [
      "-replace",
      "CFBundleIdentifier",
      "-string",
      identity.developmentId,
      plist,
    ]);
  }
}
