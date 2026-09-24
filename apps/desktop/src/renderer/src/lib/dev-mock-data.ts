/** DEV ONLY. Seed data for the in-memory preview bridge in `dev-mock.ts`. */
import type {
  AgentInfo,
  AppUpdateStatus,
  BackupStatus,
  Deployment,
  LibraryLocation,
  Preset,
  Project,
  Skill,
  SyncHealth,
} from "@loadout/shared";

export const HOME = "/Users/dev";
export const LIBRARY = `${HOME}/.loadout`;
export const NOW = Date.now();
export const HOUR = 60 * 60 * 1000;

function agent(
  key: string,
  displayName: string,
  dir: string,
  extra: Partial<AgentInfo> = {},
): AgentInfo {
  return {
    key,
    displayName,
    category: "coding",
    installed: true,
    enabled: true,
    isCustom: false,
    skillsDir: `${HOME}/${dir}/skills`,
    hasPathOverride: false,
    projectSkillsDir: `${dir}/skills`,
    hasProjectPathOverride: false,
    sharesDirWith: [],
    ...extra,
  };
}

export const SEED_AGENTS: AgentInfo[] = [
  agent("claude_code", "Claude Code", ".claude"),
  agent("cursor", "Cursor", ".cursor"),
  agent("codex", "Codex", ".codex"),
  agent("opencode", "OpenCode", ".config/opencode"),
  agent("amp", "Amp", ".config/amp", { installed: false }),
  agent("desk_helper", "Desk Helper", ".deskhelper", { category: "assistant" }),
];

export function deployment(skillId: string, agentKey: string): Deployment {
  const dir = SEED_AGENTS.find((entry) => entry.key === agentKey)?.skillsDir ?? "";
  return {
    id: `${skillId}:${agentKey}`,
    skillId,
    agentKey,
    targetPath: `${dir}/${skillId}`,
    mode: "symlink",
    syncedAt: NOW,
  };
}

function skill(
  id: string,
  description: string,
  extra: Partial<Skill> = {},
  deployedTo: string[] = [],
): Skill {
  return {
    id,
    name: id,
    dirName: id,
    description,
    sourceType: "local",
    sourceRef: null,
    sourceUrl: null,
    sourceSubpath: null,
    sourceBranch: null,
    sourceRevision: null,
    remoteRevision: null,
    updateStatus: "local_only",
    lastCheckedAt: null,
    lastCheckError: null,
    libraryPath: `${LIBRARY}/skills/${id}`,
    contentHash: id,
    createdAt: NOW - 72 * HOUR,
    updatedAt: NOW - 3 * HOUR,
    deployments: deployedTo.map((agentKey) => deployment(id, agentKey)),
    presetIds: [],
    tags: [],
    hasConflict: false,
    editedFiles: [],
    issues: [],
    ...extra,
  };
}

const GIT = {
  sourceType: "git",
  sourceUrl: "https://example.com/acme/skills.git",
  sourceBranch: "main",
  sourceRevision: "4f2a9c1",
} as const;

export const SEED_SKILLS: Skill[] = [
  skill(
    "code-review",
    "Review a diff for correctness, security and style before it merges.",
    {
      ...GIT,
      updateStatus: "update_available",
      remoteRevision: "9be01d7",
      tags: ["review", "quality"],
    },
    ["claude_code", "cursor", "codex"],
  ),
  skill(
    "commit-messages",
    "Write conventional commit messages from staged changes.",
    { tags: ["git"] },
    ["claude_code"],
  ),
  skill(
    "react-patterns",
    "Component, hook and state patterns for React 19 apps.",
    {
      sourceType: "marketplace",
      sourceRef: "acme/frontend/react-patterns",
      updateStatus: "up_to_date",
      tags: ["frontend"],
    },
    ["cursor"],
  ),
  skill("sql-migrations", "Plan and write safe, reversible database migrations.", {
    ...GIT,
    updateStatus: "up_to_date",
    tags: ["backend", "quality"],
    hasConflict: true,
  }),
  skill(
    "api-docs",
    "Keep an OpenAPI document in step with the endpoints.",
    { sourceType: "import", tags: ["backend"] },
    ["claude_code", "opencode"],
  ),
  skill("release-notes", "Turn merged pull requests into readable release notes.", {
    updateStatus: "error",
    lastCheckError: "Could not reach the source.",
  }),
  skill("test-first", "Red, green, refactor with small steps and fast feedback.", {}, [
    "claude_code",
    "cursor",
    "codex",
    "opencode",
  ]),
];

export const SEED_PRESETS: Preset[] = [
  {
    id: "p-frontend",
    name: "Frontend work",
    description: "UI projects",
    icon: "brush",
    sortOrder: 0,
    skillIds: ["react-patterns", "code-review", "test-first"],
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: "p-backend",
    name: "Backend work",
    description: null,
    icon: "database",
    sortOrder: 1,
    skillIds: ["sql-migrations", "api-docs"],
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: "p-everyday",
    name: "Everyday",
    description: null,
    icon: "sparkles",
    sortOrder: 2,
    skillIds: ["commit-messages", "test-first"],
    createdAt: NOW,
    updatedAt: NOW,
  },
];

const HEALTHY: SyncHealth = {
  local_only: 1,
  in_sync: 3,
  local_newer: 0,
  library_newer: 0,
  diverged: 0,
};

export const SEED_PROJECTS: Project[] = [
  {
    id: "pr-shop",
    name: "shop-web",
    path: `${HOME}/code/shop-web`,
    type: "project",
    supportsToggle: true,
    sortOrder: 0,
    skillCount: 4,
    syncHealth: HEALTHY,
    missing: false,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: "pr-api",
    name: "billing-api",
    path: `${HOME}/code/billing-api`,
    type: "project",
    supportsToggle: true,
    sortOrder: 1,
    skillCount: 2,
    syncHealth: { ...HEALTHY, diverged: 1 },
    missing: false,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: "pr-old",
    name: "legacy-tools",
    path: `${HOME}/code/legacy-tools`,
    type: "linked",
    supportsToggle: false,
    sortOrder: 2,
    skillCount: 0,
    syncHealth: { ...HEALTHY, in_sync: 0, local_only: 0 },
    missing: true,
    createdAt: NOW,
    updatedAt: NOW,
  },
];

export const SEED_APP_UPDATE: AppUpdateStatus = {
  phase: "idle",
  currentVersion: "0.1.0-dev",
  latestVersion: null,
  releaseUrl: "https://example.com/releases",
  method: "replace",
  blocker: "not_configured",
  progress: null,
  checkedAt: null,
  error: null,
  lastInstall: null,
};

export const SEED_BACKUP_STATUS: BackupStatus = {
  isRepo: true,
  remoteUrl: "https://example.com/dev/backup.git",
  branch: "main",
  hasChanges: true,
  changedSkillCount: 2,
  ahead: 0,
  behind: 0,
  lastCommit: "4f2a9c1",
  lastCommitAt: NOW - 5 * HOUR,
  currentSnapshot: null,
  restoredFrom: null,
  upstreamHealth: "healthy",
  gitAvailable: true,
  newerAppVersion: null,
};

export const SEED_LIBRARY_LOCATION: LibraryLocation = {
  path: LIBRARY,
  defaultPath: LIBRARY,
  overridden: false,
  pendingPath: null,
  warnings: [],
};
