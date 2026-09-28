/**
 * DEV ONLY. The newer backup handlers for the in-memory preview bridge in `dev-mock.ts`: what is
 * left out of the backup, the sync review and skill diffs. A pattern containing "SKILL" is
 * refused, like core refuses patterns that would leave whole skills out. `?review=many` makes
 * the review show many deletions.
 */
import type {
  BackupIgnoreRules,
  BackupStatus,
  ErrorCode,
  FileDiffEntry,
  SyncPreview,
  SyncPreviewItem,
  SyncSkillDiff,
} from "@loadout/shared";

export interface BackupSyncMockContext {
  /** Throw the bridge's error type so the code reaches the renderer. */
  fail(code: ErrorCode, message: string): never;
  status(): BackupStatus;
}

const MOCK_REMOTE_COMMIT = "9c1e4b7a2d3f5e6a7b8c9d0e1f2a3b4c5d6e7f80";
const OTHER_DEVICE = "Work Laptop";
const manyDeletes = new URLSearchParams(window.location.search).get("review") === "many";

const incomingItem = (
  name: string,
  change: SyncPreviewItem["change"],
  previousPath: string | null = null,
): SyncPreviewItem => ({
  id: `mock-${name}`,
  name,
  change,
  path: name,
  previousPath,
  fromDevice: OTHER_DEVICE,
});

function mockPreview(status: BackupStatus): SyncPreview {
  const deleted = manyDeletes
    ? ["pdf-tools", "sql-helper", "api-docs", "release-notes", "lint-rules", "test-writer"]
    : ["old-notes"];
  return {
    remoteCommit: status.remoteUrl ? MOCK_REMOTE_COMMIT : null,
    perSkill: true,
    incoming:
      status.behind > 0
        ? [
            incomingItem("commit-helper", "changed"),
            incomingItem("code-review", "renamed", "review"),
            incomingItem("deploy-checklist", "added"),
            ...deleted.map((name) => incomingItem(name, "deleted")),
          ]
        : [],
    outgoing: status.hasChanges
      ? [{ ...incomingItem("writing-style", "changed"), fromDevice: null }]
      : [],
    conflicts: [],
    presetsIncoming: status.behind > 0 ? 1 : 0,
    remoteBackups: status.behind,
    manyDeletes,
  };
}

const MOCK_DIFF: FileDiffEntry[] = [
  {
    path: "SKILL.md",
    status: "modified",
    kind: "text",
    before: "---\nname: commit-helper\n---\n\nWrite short commit messages.\n",
    after: "---\nname: commit-helper\n---\n\nWrite short commit messages in the imperative.\n",
    executableBefore: false,
    executableAfter: false,
  },
  {
    path: "examples.md",
    status: "added",
    kind: "text",
    before: null,
    after: "feat: add login\nfix: handle empty input\n",
    executableBefore: false,
    executableAfter: false,
  },
];

const mockDiff = (name: string): SyncSkillDiff => ({ name, entries: MOCK_DIFF });

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
    "backup.preview": () => mockPreview(ctx.status()),
    "backup.previewDiff": (skillId: string) => mockDiff(skillId.replace(/^mock-/, "")),
    "backup.conflictDiff": (skillKey: string) => mockDiff(skillKey),
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
