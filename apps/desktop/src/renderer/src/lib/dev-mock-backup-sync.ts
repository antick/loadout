/**
 * DEV ONLY. The newer backup handlers for the in-memory preview bridge in `dev-mock.ts`: what is
 * left out of the backup. A pattern containing "SKILL" is refused, like core refuses patterns
 * that would leave whole skills out.
 */
import type { BackupIgnoreRules, ErrorCode } from "@loadout/shared";

export interface BackupSyncMockContext {
  /** Throw the bridge's error type so the code reaches the renderer. */
  fail(code: ErrorCode, message: string): never;
}

const DEFAULT_IGNORES = [
  ".DS_Store",
  "Thumbs.db",
  "__pycache__/",
  "*.pyc",
  "node_modules/",
  ".venv/",
  ".env",
  "*.log",
];

export function createBackupSyncMockHandlers(
  ctx: BackupSyncMockContext,
): Record<string, (...args: never[]) => unknown> {
  let custom: string[] = ["outputs/"];
  const rules = (): BackupIgnoreRules => ({ defaults: DEFAULT_IGNORES, custom });

  return {
    "backup.ignoreRules": () => rules(),
    "backup.setIgnoreRules": (lines: string[]) => {
      const cleaned = lines.map((line) => line.trimEnd());
      while (cleaned[0] === "") cleaned.shift();
      while (cleaned.at(-1) === "") cleaned.pop();
      const blocking = cleaned.find((line) => line.includes("SKILL"));
      if (blocking) {
        ctx.fail(
          "INVALID_INPUT",
          `"${blocking}" would leave whole skills or the app's own files out of the backup. Use a narrower pattern, such as "my-skill/cache/".`,
        );
      }
      custom = cleaned;
      return rules();
    },
  };
}
