import { homedir } from "node:os";
import { createCore } from "@loadout/core";
// The app's version, not this package's: the CLI ships inside the app and on npm under it.
import appPackage from "../../../apps/desktop/package.json";
import { runCli } from "./run";

// No top-level await: the standalone build bundles this file as CommonJS.
void runCli(process.argv.slice(2), {
  createCore,
  io: {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
  },
  version: appPackage.version,
  cwd: process.cwd(),
  homeDir: homedir(),
}).then((exitCode) => {
  // Set rather than exit(): buffered output to a pipe is still flushed.
  process.exitCode = exitCode;
});
