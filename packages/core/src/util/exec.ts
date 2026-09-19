import { spawn } from "node:child_process";
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

/**
 * Run a program to completion without a shell. Never rejects on a non-zero exit — callers decide.
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
    const child = spawn(command, args, {
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
            `${command} timed out after ${Math.round(timeoutMs / 1000)}s — check your network connection`,
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
