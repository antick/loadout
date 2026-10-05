import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, isAbsolute, join } from "node:path";
import { formatSeconds } from "@loadout/shared";
import { AppError, cancelled } from "../errors";

export interface ExecOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Text piped to stdin. */
  input?: string;
  /** Called with each stderr line as it arrives (git reports progress there). */
  onStderrLine?: (line: string) => void;
}

export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

const DEFAULT_TIMEOUT_MS = 120_000;
/** What Windows can start without a shell; `.cmd`/`.bat` need one and are refused by Node. */
const WINDOWS_PROGRAM_EXTENSIONS = [".exe", ".com"] as const;

/**
 * On Windows, a bare program name is looked up in the working folder before PATH. Loadout runs
 * git inside folders full of downloaded files (the clone cache, the library), so a `git.exe`
 * shipped in a repository would run instead of the real one. Resolve the name on PATH alone.
 * Elsewhere, and for paths, the name is used as given.
 */
export function resolveProgram(
  command: string,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string {
  if (platform !== "win32" || isAbsolute(command) || /[\\/]/.test(command)) return command;
  const dirs = (env.PATH ?? env.Path ?? "").split(delimiter).filter((dir) => isAbsolute(dir));
  const names = /\.[a-z0-9]+$/i.test(command)
    ? [command]
    : WINDOWS_PROGRAM_EXTENSIONS.map((extension) => `${command}${extension}`);
  for (const dir of dirs) {
    for (const name of names) {
      const candidate = join(dir, name);
      if (existsSync(candidate)) return candidate;
    }
  }
  // Not on PATH: spawning the bare name would fall back to the working folder, so fail instead.
  return join(dirs[0] ?? "C:\\", `__${command}_not_found__`);
}

/**
 * Run a program to completion without a shell. Never rejects on a non-zero exit; callers decide.
 * Rejects on spawn failure, timeout (TIMEOUT) and abort (CANCELLED).
 */
export function exec(
  command: string,
  args: string[],
  options: ExecOptions = {},
): Promise<ExecResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) {
      reject(cancelled());
      return;
    }
    const child = spawn(resolveProgram(command, options.env ?? process.env), args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let pendingLine = "";
    let settled = false;

    const finish = (action: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
      action();
    };
    const onAbort = (): void => {
      child.kill("SIGKILL");
      finish(() => reject(cancelled()));
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(() =>
        reject(
          new AppError(
            "TIMEOUT",
            `${command} timed out after ${formatSeconds(timeoutMs)}. Check your network connection`,
          ),
        ),
      );
    }, timeoutMs);
    options.signal?.addEventListener("abort", onAbort, { once: true });

    child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
      stderr += chunk;
      if (!options.onStderrLine) return;
      const parts = (pendingLine + chunk).split(/[\r\n]+/);
      pendingLine = parts.pop() ?? "";
      for (const line of parts) if (line.trim()) options.onStderrLine(line.trim());
    });
    child.on("error", (error: NodeJS.ErrnoException) => {
      finish(() =>
        reject(
          error.code === "ENOENT"
            ? new AppError("UNSUPPORTED", `${command} is not installed or not on PATH`)
            : error,
        ),
      );
    });
    child.on("close", (code) => {
      finish(() => resolve({ code: code ?? -1, stdout, stderr }));
    });
    if (options.input !== undefined) child.stdin.write(options.input);
    child.stdin.end();
  });
}
