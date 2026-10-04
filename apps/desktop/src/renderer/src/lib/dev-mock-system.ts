/**
 * DEV ONLY. Backup, settings and system handlers for the in-memory preview bridge in
 * `dev-mock.ts`, so the Backup, Settings and Dashboard pages can be tried in a plain browser.
 *
 * Scenarios come from the page URL (before the `#`): `?backup=fresh|noremote|unrelated|nogit|
 * uptodate|rejected|auth` picks the repository state (default: changes waiting plus one conflict),
 * `?library=empty` empties the library (first-run dialog, getting-started panel), `?device=1`
 * offers "Sign in with GitHub". Magic inputs: a token containing "bad" is refused, a repository
 * name containing "public" asks before connecting, a remote URL containing "offline" fails with
 * NETWORK and one containing "private" with GIT_AUTH.
 */
import {
  type ActivityEntry,
  type AgentInfo,
  AGENT_CONTROL_SKILL_NAME,
  BACKUP_REPO_WARN_BYTES,
  BACKUP_SKILL_LIMIT_BYTES,
  type BackupConflict,
  type BackupStage,
  type BackupStatus,
  CLI_BINARY_NAME,
  type DataScope,
  type ErrorCode,
  type ErrorDetails,
  type RepairReport,
  formatTimestampCompact,
  type GithubConnectResult,
  type LibraryLocation,
  type Settings,
  type Skill,
  SNAPSHOT_TAG_PREFIX,
  type Snapshot,
  type SecretFinding,
  type SyncOutcome,
} from "@loadout/shared";
import { createAgentsMockHandlers } from "@/lib/dev-mock-agents";
import { createBackupSyncMockHandlers } from "@/lib/dev-mock-backup-sync";
import {
  HOME,
  HOUR,
  LIBRARY,
  NOW,
  SEED_BACKUP_STATUS,
  SEED_LIBRARY_LOCATION,
} from "@/lib/dev-mock-data";
import type { MockHandlers } from "@/lib/dev-mock-types";

export interface SystemMockContext {
  getSkills(): Skill[];
  setSkills(skills: Skill[]): void;
  /** The live agent list; edited in place so every other handler sees the change. */
  agents: AgentInfo[];
  getSettings(): Settings;
  emitChanged(...scope: DataScope[]): void;
  /** Where the pretend sync is, as core reports it. */
  emitStage(stage: BackupStage | null): void;
  /** Throw the bridge's error type so the code reaches the renderer. */
  fail(code: ErrorCode, message: string, details?: ErrorDetails): never;
}

const params = new URLSearchParams(window.location.search);
const scenario = params.get("backup") ?? "pending";
/** `?git=missing` previews the app on a computer without Git. */
const GIT_VERSION = params.get("git") === "missing" ? null : "2.50.1";
const DEVICE_POLLS_BEFORE_CONNECT = 2;
const GITHUB_REMOTE = "https://github.com/dev/loadout-backup.git";
const MB = 1024 * 1024;
const SYNC_STAGES: readonly BackupStage[] = [
  "preparing",
  "saving",
  "downloading",
  "merging",
  "uploading",
];
const STAGE_MS = 300;
const PUBLIC_CONFIRM_ID = "public-confirm";

function initialStatus(): BackupStatus {
  const base: BackupStatus = { ...SEED_BACKUP_STATUS, remoteUrl: GITHUB_REMOTE, behind: 1 };
  const none: BackupStatus = {
    ...base,
    isRepo: false,
    remoteUrl: null,
    branch: null,
    hasChanges: false,
    changedSkillCount: 0,
    behind: 0,
    lastCommit: null,
    lastCommitAt: null,
    upstreamHealth: "no_remote",
  };
  switch (scenario) {
    case "fresh":
      return none;
    case "nogit":
      return { ...none, gitAvailable: false };
    case "noremote":
      return { ...base, remoteUrl: null, behind: 0, upstreamHealth: "no_remote" };
    case "unrelated":
      return { ...base, upstreamHealth: "unrelated_histories" };
    case "uptodate":
      return { ...base, hasChanges: false, changedSkillCount: 0, behind: 0 };
    default:
      return base;
  }
}

function snapshotTag(at: number, commit: string): string {
  return `${SNAPSHOT_TAG_PREFIX}${formatTimestampCompact(at)}-${commit}`;
}

function seedSnapshots(): Snapshot[] {
  const rows: [number, string, string, string][] = [
    [5 * HOUR, "4f2a9c1e", "backup: sync skills library", "Studio Mac"],
    [29 * HOUR, "a81c07de", "backup: sync skills library", "Work Laptop"],
    [4 * 24 * HOUR, "09be4412", "restore: switch skills library", "Studio Mac"],
  ];
  return rows.map(([ago, commit, message, device]) => ({
    tag: snapshotTag(NOW - ago, commit),
    commit,
    message,
    createdAt: NOW - ago,
    device,
  }));
}

const SEED_ACTIVITY: ActivityEntry[] = [
  { kind: "backup", subject: "Studio Mac", detail: "Pushed 2 changed skills", ok: true },
  { kind: "deploy", subject: "commit-helper", detail: "Claude Code", ok: true },
  { kind: "update", subject: "release-notes", detail: "acme/agent-skills", ok: true },
  {
    kind: "install",
    subject: "pdf-forms",
    detail: "The repository could not be reached.",
    ok: false,
  },
  { kind: "preset", subject: "Frontend work", detail: "Added to Cursor", ok: true },
  { kind: "import", subject: "sql-review", detail: "~/.codex/skills", ok: true },
  { kind: "undeploy", subject: "sql-review", detail: "Codex", ok: true },
  { kind: "remove", subject: "old-notes", detail: null, ok: true },
].map((entry, index) =>
  Object.assign(entry, {
    kind: entry.kind as ActivityEntry["kind"],
    id: `a-${index}`,
    at: NOW - (index * 3 + 1) * HOUR,
  }),
);

const cleanRepair = (): RepairReport => ({
  ranAt: NOW,
  checked: 6,
  repaired: [],
  failed: [],
  skippedAgents: 0,
});
let repairReport: RepairReport | null =
  params.get("repair") === "failed"
    ? {
        ...cleanRepair(),
        failed: [
          {
            skill: "release-notes",
            agentKey: "cursor",
            agent: "Cursor",
            path: `${HOME}/.cursor/skills/release-notes`,
            message: "A folder that Loadout did not create is in the way.",
          },
        ],
      }
    : cleanRepair();

export function createSystemMockHandlers(ctx: SystemMockContext): MockHandlers {
  let status = initialStatus();
  let snapshots = status.isRepo ? seedSnapshots() : [];
  let conflicts: BackupConflict[] =
    scenario === "pending"
      ? [
          {
            skillKey: "release-notes",
            skillName: "release-notes",
            theirsCommit: "a81c07de55aa",
            theirsPath: "release-notes",
            detectedAt: NOW - 2 * HOUR,
          },
          {
            skillKey: "sql-helper",
            skillName: "sql-helper",
            theirsCommit: "a81c07de55aa",
            theirsPath: "sql-helper",
            detectedAt: NOW - 3 * HOUR,
          },
        ]
      : [];
  let deviceName = "Studio Mac";
  // One skill holds what looks like a token, so the backup page shows the held-back list.
  const heldBack: SecretFinding[] = [
    {
      id: "mock-secret-1",
      file: "api-docs/reference.md",
      path: `${HOME}/.loadout/skills/api-docs/reference.md`,
      line: 14,
      kind: "github_token",
      masked: "ghp_…9fQ2",
      committed: false,
    },
  ];
  const allowedSecrets = new Set<string>();
  let devicePolls = 0;
  let location: LibraryLocation = SEED_LIBRARY_LOCATION;
  let agentControl = { installed: false, skillId: null as string | null, dismissed: false };
  if (params.get("library") === "empty") ctx.setSkills([]);

  const checkUrl = (url: string): void => {
    if (url.includes("offline")) ctx.fail("NETWORK", "Could not connect to the remote.");
    if (url.includes("private")) ctx.fail("GIT_AUTH", "Authentication failed.");
  };

  const takeSnapshot = (message: string): string => {
    const commit = Math.random().toString(16).slice(2, 10);
    const tag = snapshotTag(Date.now(), commit);
    snapshots = [{ tag, commit, message, createdAt: Date.now(), device: deviceName }, ...snapshots];
    status = { ...status, currentSnapshot: tag, lastCommitAt: Date.now() };
    return tag;
  };

  let pendingPublic: string | null = null;
  const connectResult = (repoName: string): GithubConnectResult => {
    const url = `https://github.com/dev/${repoName}.git`;
    status = { ...status, remoteUrl: url };
    return {
      url,
      login: "dev",
      repoCreated: !repoName.includes("existing"),
      repoPrivate: !repoName.includes("public"),
      remoteHasContent: repoName.includes("existing"),
    };
  };

  return {
    ...createBackupSyncMockHandlers({ fail: ctx.fail, status: () => status }),
    "backup.status": () => status,
    "backup.fetch": () => undefined,
    "backup.init": () => {
      status = { ...status, isRepo: true, branch: "main", upstreamHealth: "no_remote" };
    },
    "backup.setRemote": (url: string) => {
      checkUrl(url);
      const clean = url.replace(/\/\/[^@/]+@/, "//");
      status = {
        ...status,
        remoteUrl: clean,
        upstreamHealth: status.isRepo ? "no_upstream" : status.upstreamHealth,
      };
      return clean;
    },
    "backup.removeRemote": () => {
      status = { ...status, remoteUrl: null, upstreamHealth: "no_remote", behind: 0 };
    },
    "backup.clone": (url: string) => {
      checkUrl(url);
      status = { ...initialStatus(), ...SEED_BACKUP_STATUS, remoteUrl: url, hasChanges: false };
      status = { ...status, changedSkillCount: 0 };
      snapshots = seedSnapshots();
    },
    "backup.reclone": (url: string) => {
      checkUrl(url);
      status = { ...status, upstreamHealth: "healthy", hasChanges: false, changedSkillCount: 0 };
      status = { ...status, ahead: 0, behind: 0 };
    },
    "backup.sync": async (): Promise<SyncOutcome> => {
      // Long enough to see each stage go by, short enough for the UI tests.
      for (const stage of SYNC_STAGES) {
        ctx.emitStage(stage);
        await new Promise((resolve) => setTimeout(resolve, STAGE_MS));
      }
      ctx.emitStage(null);
      const held = heldBack.filter((finding) => !allowedSecrets.has(finding.id));
      if (held.length > 0) {
        ctx.fail(
          "SECRETS_FOUND",
          `Backup held back: ${held[0]?.file}, line ${held[0]?.line} looks like a key or token. Remove it, or choose Back up anyway on the Backup page.`,
        );
      }
      if (scenario === "rejected") ctx.fail("GIT_REJECTED", "[rejected] non-fast-forward");
      if (scenario === "auth") ctx.fail("GIT_AUTH", "Authentication failed.");
      if (status.upstreamHealth === "unrelated_histories") {
        ctx.fail("GIT_UNRELATED", "refusing to merge unrelated histories");
      }
      const merged = status.behind > 0;
      const dirty = status.hasChanges || status.upstreamHealth === "no_upstream";
      status = { ...status, hasChanges: false, changedSkillCount: 0, ahead: 0, behind: 0 };
      status = { ...status, upstreamHealth: "healthy" };
      return {
        committed: dirty,
        pushed: dirty || merged,
        snapshot: dirty || merged ? takeSnapshot("backup: sync skills library") : null,
        merge: merged
          ? {
              upToDate: false,
              fastForward: false,
              updated: [{ name: "commit-helper", fromDevice: "Work Laptop" }],
              keptLocal: [],
              removed: [],
              newConflicts: [],
              pendingTotal: conflicts.length,
            }
          : null,
      };
    },
    "backup.secretFindings": (): SecretFinding[] =>
      heldBack.filter((finding) => !allowedSecrets.has(finding.id)),
    "backup.cleanUpUnpushed": () => {
      heldBack.splice(0, heldBack.length);
    },
    "backup.allowSecrets": (ids: string[]) => {
      for (const id of ids) allowedSecrets.add(id);
    },
    "backup.snapshots": () => snapshots,
    "backup.restore": (tag: string) => {
      const safety = takeSnapshot("backup before restore");
      status = { ...status, restoredFrom: tag, hasChanges: false, changedSkillCount: 0 };
      return safety;
    },
    "backup.conflicts": () => conflicts,
    "backup.resolveConflict": (skillKey: string) => {
      conflicts = conflicts.filter((conflict) => conflict.skillKey !== skillKey);
      ctx.emitChanged("skills", "presets", "backup", "items");
      return takeSnapshot("resolve conflict");
    },
    "backup.resolveConflicts": (skillKeys: string[]) => {
      conflicts = conflicts.filter((conflict) => !skillKeys.includes(conflict.skillKey));
      ctx.emitChanged("skills", "presets", "backup", "items");
      return takeSnapshot("resolve conflicts");
    },
    "backup.sizeReport": () => ({
      totalBytes: 212 * MB,
      oversized: [{ name: "video-tools", bytes: 148 * MB, excluded: true }],
      skillLimitBytes: BACKUP_SKILL_LIMIT_BYTES,
      repoWarnBytes: BACKUP_REPO_WARN_BYTES,
    }),
    "backup.deviceName": () => deviceName,
    "backup.setDeviceName": (name: string) => {
      deviceName = name.trim();
      return deviceName;
    },
    "backup.githubConnect": (token: string, repoName: string) => {
      if (token.includes("bad")) ctx.fail("GITHUB_TOKEN_INVALID", "Bad credentials");
      // Like core: a public repository waits for the user's OK before anything is saved.
      if (repoName.includes("public")) {
        pendingPublic = repoName;
        ctx.fail("GITHUB_REPO_PUBLIC", `dev/${repoName} is public.`, {
          repo: `dev/${repoName}`,
          confirmId: PUBLIC_CONFIRM_ID,
        });
      }
      return connectResult(repoName);
    },
    "backup.githubConfirmPublic": (confirmId: string) => {
      if (confirmId !== PUBLIC_CONFIRM_ID || !pendingPublic) ctx.fail("NOT_FOUND", "Expired.");
      const result = connectResult(pendingPublic);
      pendingPublic = null;
      return result;
    },
    "backup.githubDiscardPublic": () => {
      pendingPublic = null;
    },
    "backup.githubDeviceStart": () => {
      devicePolls = 0;
      return {
        deviceCode: "device-code",
        userCode: "WDJB-MJHT",
        verificationUri: "https://github.com/login/device",
        expiresIn: 900,
        interval: 5,
      };
    },
    "backup.githubDevicePoll": (_deviceCode: string, repoName: string) => {
      devicePolls += 1;
      return devicePolls < DEVICE_POLLS_BEFORE_CONNECT
        ? { status: "pending", result: null }
        : { status: "connected", result: connectResult(repoName) };
    },
    "backup.githubAuthMethod": () => "pat",
    "backup.githubDeviceAvailable": () =>
      params.get("device") === "1" || ctx.getSettings().githubClientId !== "",

    ...createAgentsMockHandlers(ctx),

    "system.libraryLocation": () => location,
    "system.setLibraryPath": (path: string | null) => {
      const target = path ?? location.defaultPath;
      location = { ...location, pendingPath: target === location.path ? null : target };
      return location;
    },
    "system.revealLibrary": () => undefined,
    "system.activity": (limit?: number) => SEED_ACTIVITY.slice(0, limit ?? SEED_ACTIVITY.length),
    "system.diagnostics": () => ({
      appVersion: "0.1.0-dev",
      os: "darwin",
      osVersion: "25.0.0",
      arch: "arm64",
      libraryPath: LIBRARY,
      libraryPathOverridden: false,
      gitVersion: GIT_VERSION,
      githubSignIn: "gh",
    }),
    "system.logExcerpt": () => ({
      logPath: `${LIBRARY}/logs/main.log`,
      excerpt: "2026-01-01T10:00:00.000Z INFO [app] started\n",
      lineCount: 1,
      hasWarnings: false,
    }),
    "system.exportLogs": () => ({
      zipPath: `${HOME}/Downloads/${CLI_BINARY_NAME}-logs-${formatTimestampCompact(Date.now())}.zip`,
      fileCount: 4,
    }),
    // `?repair=failed` previews the banner for a deployment that could not be put back.
    "system.repairReport": () => repairReport,
    "system.repairDeployments": () => {
      repairReport = { ...cleanRepair(), repaired: [] };
      return repairReport;
    },
    "system.dismissRepair": () => {
      repairReport = null;
    },
    "system.lastCrash": () =>
      params.get("crash") === "1"
        ? { at: NOW - HOUR, message: "TypeError: cannot read properties of undefined" }
        : null,
    "system.cliStatus": () => ({
      published: true,
      path: `${LIBRARY}/bin/${CLI_BINARY_NAME}`,
      version: "0.1.0-dev",
    }),
    "system.agentControlStatus": () => agentControl,
    "system.setupAgentControl": () => {
      agentControl = { ...agentControl, installed: true, skillId: AGENT_CONTROL_SKILL_NAME };
      ctx.emitChanged("settings");
      const installed = ctx.getSkills()[0];
      if (!installed) return ctx.fail("NOT_FOUND", "The preview library has no skills.");
      return installed;
    },
    "system.dismissAgentControl": () => {
      agentControl = { ...agentControl, dismissed: true };
    },
    "app.restart": () => window.location.reload(),
  };
}
