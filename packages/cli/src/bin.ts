import { homedir } from "node:os";
import { createCore } from "@loadout/core";
// The app's version, not this package's: the CLI ships inside the app and on npm under it.
import { version as appVersion } from "../../../apps/desktop/package.json";
import { pickInTerminal } from "./picker/terminal";
import { runCli } from "./run";

/** The reader closed the pipe early, as in `loadout skills list | head -1`. */
const BROKEN_PIPE = "EPIPE";

/** Both ends a terminal a person types in: only then may a command ask. */
const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
const terminal = { input: process.stdin, output: process.stdout, color: !process.env.NO_COLOR };

// Nobody reads the rest: stop quietly, with the exit code set so far (0 unless one was set).
process.stdout.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code !== BROKEN_PIPE) throw error;
  process.exit();
});

// No top-level await: the standalone build bundles this file as CommonJS.
void runCli(process.argv.slice(2), {
  createCore,
  io: {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
  },
  version: appVersion,
  cwd: process.cwd(),
  homeDir: homedir(),
  ...(interactive ? { picker: (request) => pickInTerminal(terminal, request) } : {}),
}).then((exitCode) => {
  // Set rather than exit(): buffered output to a pipe is still flushed.
  process.exitCode = exitCode;
});
