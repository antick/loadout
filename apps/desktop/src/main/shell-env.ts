import { spawn } from "node:child_process";
import { SHELL_ENV_MAX_BYTES, SHELL_ENV_TIMEOUT_MS } from "./constants";

/** Printed before the variables, so anything a shell prints on start-up is skipped. */
const MARKER = "__LOADOUT_SHELL_ENV__";
/** Set while resolving, so a shell profile can skip slow start-up work. */
const RESOLVING_FLAG = "LOADOUT_RESOLVING_SHELL_ENV";
const FALLBACK_SHELL = "/bin/sh";

/** The `names` found in `env -0` output printed after the marker; null without the marker. */
export function pickShellEnv(
  output: string,
  names: readonly string[],
): Record<string, string> | null {
  const start = output.lastIndexOf(MARKER);
  if (start === -1) return null;
  const wanted = new Set(names);
  const found: Record<string, string> = {};
  for (const entry of output.slice(start + MARKER.length).split("\0")) {
    const at = entry.indexOf("=");
    if (at <= 0) continue;
    const name = entry.slice(0, at);
    const value = entry.slice(at + 1);
    if (wanted.has(name) && value) found[name] = value;
  }
  return found;
}

/**
 * The environment core runs with. Started from a terminal, the app has the shell's variables
 * already, and they win. Not PATH: a Dock launch has a bare one, without `gh` and the other tools
 * the login shell's PATH finds.
 */
export function coreEnv(
  shellEnv: Record<string, string>,
  processEnv: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  const env = { ...shellEnv, ...processEnv };
  if (shellEnv.PATH) env.PATH = shellEnv.PATH;
  return env;
}

export interface ReadShellEnvOptions {
  /** Defaults to `$SHELL`. */
  shell?: string;
  timeoutMs?: number;
  platform?: NodeJS.Platform;
}

/**
 * These variables as the user's login shell sets them. An app opened from the Dock or a desktop
 * launcher does not get what `~/.zshrc` or `~/.profile` export, so the shell is asked once.
 * Resolves to an empty record on Windows (no such split), and to null when the shell could not
 * be read (a failure or a timeout): the caller then knows it has not learned the real values.
 */
export function readShellEnv(
  names: readonly string[],
  options: ReadShellEnvOptions = {},
): Promise<Record<string, string> | null> {
  const platform = options.platform ?? process.platform;
  if (platform === "win32" || names.length === 0) return Promise.resolve({});
  const shell = options.shell ?? process.env.SHELL ?? FALLBACK_SHELL;
  return new Promise((resolve) => {
    let output = "";
    let settled = false;
    const finish = (found: Record<string, string> | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(found);
    };
    // No stdin: a profile that waits for input must not hang the shell. SIGKILL on timeout,
    // since an interactive shell ignores the gentler SIGTERM.
    const child = spawn(shell, ["-i", "-l", "-c", `printf '%s' ${MARKER}; command env -0`], {
      stdio: ["ignore", "pipe", "ignore"],
      env: { ...process.env, [RESOLVING_FLAG]: "1" },
      windowsHide: true,
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(null);
    }, options.timeoutMs ?? SHELL_ENV_TIMEOUT_MS);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      output += chunk;
      if (output.length > SHELL_ENV_MAX_BYTES) {
        child.kill("SIGKILL");
        finish(null);
      }
    });
    child.on("error", () => finish(null));
    child.on("close", (code) => finish(code === 0 ? pickShellEnv(output, names) : null));
  });
}
