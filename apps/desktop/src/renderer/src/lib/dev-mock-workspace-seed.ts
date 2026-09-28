/** DEV ONLY. Seed data and pure helpers for the agent-folder and project mocks. */
import type {
  AgentInfo,
  BrokenSkillFolder,
  Project,
  ProjectTarget,
  Skill,
  SyncStatus,
} from "@loadout/shared";
import { HOME, HOUR, NO_PROJECT_ACTIVITY, NOW } from "@/lib/dev-mock-data";

/** A copy on disk as the mock remembers it; the rest of a `LocalSkill` is derived when listing. */
export interface Copy {
  relativePath: string;
  agentKey: string;
  status: SyncStatus;
  enabled: boolean;
  librarySkillId: string | null;
  description: string | null;
}

export const copy = (
  relativePath: string,
  agentKey: string,
  status: SyncStatus,
  extra: Partial<Copy> = {},
): Copy => ({
  relativePath,
  agentKey,
  status,
  enabled: true,
  librarySkillId: status === "local_only" ? null : relativePath,
  description: null,
  ...extra,
});

export const dirNameOf = (relativePath: string): string =>
  relativePath.split("/").pop() ?? relativePath;
export const sameSkill = (entry: Copy, relativePath: string): boolean =>
  entry.relativePath.toLowerCase() === relativePath.toLowerCase();

export function documentFor(name: string, description: string | null, edited: boolean): string {
  const extra = edited ? "\n## Local notes\n\nChanged in this folder only.\n" : "";
  return `---\nname: ${name}\ndescription: ${description ?? ""}\n---\n\n# ${name}\n\n${description ?? ""}\n\n## Steps\n\n1. Read the request.\n2. Do the work in small steps.\n3. Check the result.\n${extra}`;
}

/** Sync status of managed deployments that are not simply in sync, keyed `agent:skill`. */
export function seedDeployedStatus(): Map<string, SyncStatus> {
  return new Map<string, SyncStatus>([
    ["claude_code:code-review", "library_newer"],
    ["claude_code:commit-messages", "local_newer"],
    ["claude_code:api-docs", "diverged"],
  ]);
}

/** Folders the app did not put there. */
export function seedUnmanaged(): Copy[] {
  return [
    copy("scratch-notes", "claude_code", "local_only", {
      description: "Personal notes on how this machine is set up.",
    }),
    copy("team/pr-checklist", "claude_code", "local_only", {
      description: "Checklist the team runs before opening a pull request.",
    }),
    copy("react-patterns", "claude_code", "in_sync"),
    copy("sql-migrations", "cursor", "local_newer"),
    copy("old-linter-rules", "cursor", "local_only", { description: null }),
  ];
}

/** Folders the agent skips, keyed by agent; paths are filled in from the agent's folder. */
export function seedBroken(): Record<string, Omit<BrokenSkillFolder, "path">[]> {
  return {
    claude_code: [
      {
        dirName: "half-deleted",
        relativePath: "half-deleted",
        reason: "missing_document",
        linkTarget: null,
        files: ["notes.md", "scripts/"],
        managed: false,
      },
      {
        dirName: "old-checkout",
        relativePath: "old-checkout",
        reason: "dangling_link",
        linkTarget: `${HOME}/code/agent-skills/old-checkout`,
        files: [],
        managed: false,
      },
      {
        dirName: "release-notes",
        relativePath: "release-notes",
        reason: "missing_document",
        linkTarget: null,
        files: ["examples/"],
        managed: true,
      },
      {
        dirName: "drafts",
        relativePath: "team/drafts",
        reason: "missing_document",
        linkTarget: null,
        files: [],
        managed: false,
      },
      {
        dirName: "tmp",
        relativePath: "tmp",
        reason: "missing_document",
        linkTarget: null,
        files: [],
        managed: false,
      },
    ],
  };
}

export function seedProjectCopies(): Map<string, Copy[]> {
  return new Map<string, Copy[]>([
    [
      "pr-shop",
      [
        copy("code-review", "claude_code", "in_sync"),
        copy("code-review", "cursor", "library_newer"),
        copy("react-patterns", "cursor", "local_newer"),
        copy("test-first", "claude_code", "in_sync"),
        copy("test-first", "cursor", "in_sync"),
        copy("test-first", "codex", "in_sync"),
        copy("api-docs", "claude_code", "in_sync", { enabled: false }),
        copy("sql-migrations", "claude_code", "diverged"),
        copy("sql-migrations", "cursor", "local_newer"),
        copy("shop/checkout-flow", "claude_code", "local_only", {
          description: "How the checkout steps fit together in this repository.",
        }),
      ],
    ],
    [
      "pr-api",
      [
        copy("api-docs", "claude_code", "diverged"),
        copy("commit-messages", "claude_code", "in_sync"),
      ],
    ],
  ]);
}

export function seedLastExportAgents(): Map<string, string[]> {
  return new Map<string, string[]>([["pr-shop", ["claude_code", "cursor"]]]);
}

/** The folders a mock project has: its own for a linked workspace, else one per agent. */
export function projectTargets(project: Project, agents: AgentInfo[]): ProjectTarget[] {
  if (project.type === "linked") {
    return [
      {
        key: project.id,
        displayName: project.name,
        agentKeys: [project.id],
        relativeDir: "",
        enabled: true,
        installed: true,
        isCustom: false,
      },
    ];
  }
  return agents.flatMap((agent) =>
    agent.projectSkillsDir
      ? [
          {
            key: agent.key,
            displayName: agent.displayName,
            agentKeys: [agent.key],
            relativeDir: agent.projectSkillsDir,
            enabled: agent.enabled,
            installed: agent.installed,
            isCustom: agent.isCustom,
          },
        ]
      : [],
  );
}

/** A library skill made from a folder on disk, shaped after `template`. */
export function mockImportedSkill(
  template: Skill,
  name: string,
  description: string | null,
): Skill {
  return {
    ...template,
    id: name,
    name,
    dirName: name,
    description,
    sourceType: "local",
    sourceRef: null,
    sourceUrl: null,
    sourceBranch: null,
    sourceRevision: null,
    remoteRevision: null,
    updateStatus: "local_only",
    libraryPath: `${HOME}/.loadout/skills/${name}`,
    contentHash: name,
    createdAt: NOW,
    updatedAt: NOW - HOUR,
    deployments: [],
    presetIds: [],
    tags: [],
    hasConflict: false,
    editedFiles: [],
    issues: [],
    manualOnly: false,
  };
}

/** A freshly linked project, last in the list. */
export function mockProject(
  name: string,
  path: string,
  type: Project["type"],
  sortOrder: number,
): Project {
  return {
    id: `pr-${Date.now()}-${sortOrder}`,
    name,
    path,
    type,
    supportsToggle: true,
    sortOrder,
    skillCount: 0,
    syncHealth: { local_only: 0, in_sync: 0, local_newer: 0, library_newer: 0, diverged: 0 },
    missing: false,
    ...NO_PROJECT_ACTIVITY,
    createdAt: NOW,
    updatedAt: NOW,
  };
}
