import { homedir } from "node:os";
import { createCore } from "@loadout/core";
import packageJson from "../package.json";
import { runCli } from "./run";

const exitCode = await runCli(process.argv.slice(2), {
  createCore,
  io: {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
  },
  version: packageJson.version,
  cwd: process.cwd(),
  homeDir: homedir(),
});
// Set rather than exit(): buffered output to a pipe is still flushed.
process.exitCode = exitCode;
