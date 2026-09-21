/**
 * DEV ONLY. Agent-folder (`workspace.*`) and project (`projects.*`) handlers for the in-memory
 * preview bridge in `dev-mock.ts`, so the agent and project pages can be tried in a plain browser.
 * Seeds cover every sync status, unmanaged folders, a nested folder, a switched-off skill and a
 * skill whose two copies disagree (pushing it reports conflicting variants).
 */
import type {
  AgentInfo,
  ErrorCode,
  LocalSkill,
  Project,
  ProjectTarget,
  PushToLibraryResult,
  Skill,
  SkillDocument,
  SyncStatus,
} from "@loadout/shared";
import { HOME, HOUR, NOW } from "@/lib/dev-mock-data";

export interface WorkspaceMockContext {
  getSkills(): Skill[];
  setSkills(next: Skill[]): void;
  getAgents(): AgentInfo[];
  getProjects(): Project[];
  setProjects(next: Project[]): void;
  /** Deploy or remove one pair; false when it was already in the wanted state. */
  setDeployed(skillId: string, agentKey: string, on: boolean): boolean;
  emitChanged(...scope: ("skills" | "projects")[]): void;
  fail(code: ErrorCode, message: string): never;
}

const STEP_MS = 350;
const SKILL_FILES = ["SKILL.md", "scripts", "reference.md"];
const SCAN_RESULTS = ["shop-web", "billing-api", "docs-site", "mobile/app", "tools/release-bot"];
const DISABLED_SUFFIX = "-disabled";

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => window.setTimeout(resolve, ms));

/** A copy on disk as the mock remembers it; the rest of a `LocalSkill` is derived when listing. */
interface Copy {
  relativePath: string;
  agentKey: string;
  status: SyncStatus;
  enabled: boolean;
  librarySkillId: string | null;
  description: string | null;
}

const copy = (
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

const dirNameOf = (relativePath: string): string => relativePath.split("/").pop() ?? relativePath;
const sameSkill = (entry: Copy, relativePath: string): boolean =>
  entry.relativePath.toLowerCase() === relativePath.toLowerCase();

function documentFor(name: string, description: string | null, edited: boolean): string {
  const extra = edited ? "\n## Local notes\n\nChanged in this folder only.\n" : "";
  return `---\nname: ${name}\ndescription: ${description ?? ""}\n---\n\n# ${name}\n\n${description ?? ""}\n\n## Steps\n\n1. Read the request.\n2. Do the work in small steps.\n3. Check the result.\n${extra}`;
}

export function createWorkspaceMockHandlers(
  ctx: WorkspaceMockContext,
): Record<string, (...args: never[]) => unknown> {
  // Sync status of managed deployments that are not simply in sync, keyed `agent:skill`.
  const deployedStatus = new Map<string, SyncStatus>([
    ["claude_code:code-review", "library_newer"],
    ["claude_code:commit-messages", "local_newer"],
    ["claude_code:api-docs", "diverged"],
  ]);
  // Folders the app did not put there.
  let unmanaged: Copy[] = [
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
  const projectCopies = new Map<string, Copy[]>([
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
  const lastExportAgents = new Map<string, string[]>([["pr-shop", ["claude_code", "cursor"]]]);

  const librarySkill = (id: string | null): Skill | undefined =>
    id === null ? undefined : ctx.getSkills().find((entry) => entry.id === id);
  const agentOf = (key: string): AgentInfo | undefined =>
    ctx.getAgents().find((entry) => entry.key === key);

  function toLocalSkill(
    entry: Copy,
    root: string,
    managed: boolean,
    displayName: string,
  ): LocalSkill {
    const match = librarySkill(entry.librarySkillId);
    return {
      name: match?.name ?? dirNameOf(entry.relativePath),
      dirName: dirNameOf(entry.relativePath),
      relativePath: entry.relativePath,
      description: entry.description ?? match?.description ?? null,
      path: `${root}${entry.enabled ? "" : DISABLED_SUFFIX}/${entry.relativePath}`,
      files: entry.status === "local_only" ? ["SKILL.md"] : SKILL_FILES,
      enabled: entry.enabled,
      agentKey: entry.agentKey,
      agentDisplayName: displayName,
      tags: match?.tags ?? [],
      librarySkillId: entry.librarySkillId,
      managed,
      syncStatus: entry.status,
    };
  }

  function listAgentFolder(agentKey: string): LocalSkill[] {
    const agent = agentOf(agentKey);
    if (!agent) return [];
    const managed = ctx
      .getSkills()
      .filter((skill) => skill.deployments.some((entry) => entry.agentKey === agentKey))
      .map((skill) =>
        toLocalSkill(
          copy(
            skill.dirName,
            agentKey,
            deployedStatus.get(`${agentKey}:${skill.id}`) ?? "in_sync",
            {
              librarySkillId: skill.id,
            },
          ),
          agent.skillsDir,
          true,
          agent.displayName,
        ),
      );
    const taken = new Set(managed.map((skill) => skill.relativePath));
    const loose = unmanaged
      .filter((entry) => entry.agentKey === agentKey && !taken.has(entry.relativePath))
      .map((entry) => toLocalSkill(entry, agent.skillsDir, false, agent.displayName));
    return [...managed, ...loose].sort((a, b) => a.name.localeCompare(b.name));
  }

  function findProject(id: string): Project {
    const found = ctx.getProjects().find((entry) => entry.id === id);
    return found ?? ctx.fail("NOT_FOUND", `Project not found: ${id}`);
  }

  function targetsOf(project: Project): ProjectTarget[] {
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
    return ctx.getAgents().flatMap((agent) =>
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

  const copiesOf = (projectId: string): Copy[] => projectCopies.get(projectId) ?? [];

  function patchCopies(
    projectId: string,
    relativePath: string,
    patch: (entry: Copy) => Copy,
  ): void {
    projectCopies.set(
      projectId,
      copiesOf(projectId).map((entry) => (sameSkill(entry, relativePath) ? patch(entry) : entry)),
    );
    ctx.emitChanged("projects");
  }

  /** New library skill made from a folder on disk. */
  function importToLibrary(name: string, description: string | null): Skill {
    const created: Skill = {
      ...(ctx.getSkills()[0] as Skill),
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
    };
    ctx.setSkills([...ctx.getSkills(), created]);
    return created;
  }

  function newProject(name: string, path: string, type: Project["type"]): Project {
    if (ctx.getProjects().some((entry) => entry.path === path)) {
      ctx.fail("ALREADY_EXISTS", `This folder is already a workspace: ${path}`);
    }
    const created: Project = {
      id: `pr-${Date.now()}-${ctx.getProjects().length}`,
      name,
      path,
      type,
      supportsToggle: true,
      sortOrder: ctx.getProjects().length,
      skillCount: 0,
      syncHealth: { local_only: 0, in_sync: 0, local_newer: 0, library_newer: 0, diverged: 0 },
      missing: false,
      createdAt: NOW,
      updatedAt: NOW,
    };
    ctx.setProjects([...ctx.getProjects(), created]);
    ctx.emitChanged("projects");
    return created;
  }

  return {
    "workspace.list": (agentKey: string) => listAgentFolder(agentKey),
    "workspace.counts": (agentKeys: string[]) =>
      Object.fromEntries(agentKeys.map((key) => [key, listAgentFolder(key).length])),
    "workspace.document": (agentKey: string, relativePath: string): SkillDocument => {
      const found = listAgentFolder(agentKey).find((entry) => entry.relativePath === relativePath);
      if (!found) return ctx.fail("NOT_FOUND", "This skill is no longer in the folder.");
      return {
        filename: "SKILL.md",
        content: documentFor(found.name, found.description, found.syncStatus !== "in_sync"),
        files: found.files,
        path: `${found.path}/SKILL.md`,
      };
    },
    "workspace.upload": async (agentKey: string, relativePath: string): Promise<Skill> => {
      await wait(STEP_MS);
      const found = listAgentFolder(agentKey).find((entry) => entry.relativePath === relativePath);
      if (!found) return ctx.fail("NOT_FOUND", "This skill is no longer in the folder.");
      const skill =
        librarySkill(found.librarySkillId) ?? importToLibrary(found.dirName, found.description);
      // Adopted: the folder becomes a managed deployment of the library copy.
      unmanaged = unmanaged.filter(
        (entry) => !(entry.agentKey === agentKey && entry.relativePath === relativePath),
      );
      deployedStatus.delete(`${agentKey}:${skill.id}`);
      ctx.setDeployed(skill.id, agentKey, true);
      ctx.emitChanged("skills");
      return skill;
    },
    "workspace.pull": async (agentKey: string, relativePath: string) => {
      await wait(STEP_MS);
      const found = listAgentFolder(agentKey).find((entry) => entry.relativePath === relativePath);
      if (found?.syncStatus === "local_newer") {
        ctx.fail("INVALID_INPUT", "The local skill is newer than the library version.");
      }
      if (found?.librarySkillId) deployedStatus.delete(`${agentKey}:${found.librarySkillId}`);
      unmanaged = unmanaged.map((entry) =>
        entry.agentKey === agentKey && entry.relativePath === relativePath
          ? { ...entry, status: "in_sync" }
          : entry,
      );
      ctx.emitChanged("skills");
    },
    "workspace.deleteLocal": (agentKey: string, relativePath: string) => {
      if (relativePath === "old-linter-rules") {
        ctx.fail("IO", "The folder is read-only, so it could not be deleted.");
      }
      unmanaged = unmanaged.filter(
        (entry) => !(entry.agentKey === agentKey && entry.relativePath === relativePath),
      );
      ctx.emitChanged("skills");
    },

    "projects.add": async (path: string): Promise<Project> => {
      await wait(STEP_MS);
      if (path.includes("missing"))
        ctx.fail("NOT_FOUND", `Project is not an existing folder: ${path}`);
      return newProject(dirNameOf(path.replace(/\/+$/, "")), path, "project");
    },
    "projects.addLinked": async (name: string, path: string, disabledPath?: string | null) => {
      await wait(STEP_MS);
      if (disabledPath && (disabledPath.startsWith(path) || path.startsWith(disabledPath))) {
        ctx.fail(
          "INVALID_INPUT",
          "The skills folder and the disabled skills folder must not overlap",
        );
      }
      return newProject(name, path, "linked");
    },
    "projects.scan": async (root: string): Promise<string[]> => {
      await wait(STEP_MS * 2);
      if (root.includes("empty")) return [];
      const base = root.replace(/\/+$/, "");
      return SCAN_RESULTS.map((name) => `${base}/${name}`).sort();
    },
    "projects.targets": (id: string) => targetsOf(findProject(id)),
    "projects.skills": (id: string): LocalSkill[] => {
      const project = findProject(id);
      const targets = targetsOf(project);
      return copiesOf(id)
        .flatMap((entry) => {
          const target = targets.find((candidate) => candidate.key === entry.agentKey);
          if (!target) return [];
          const root = target.relativeDir ? `${project.path}/${target.relativeDir}` : project.path;
          return [toLocalSkill(entry, root, false, target.displayName)];
        })
        .sort((a, b) => a.name.localeCompare(b.name));
    },
    "projects.document": (id: string, relativePath: string, agentKey: string): SkillDocument => {
      const entry = copiesOf(id).find(
        (candidate) => sameSkill(candidate, relativePath) && candidate.agentKey === agentKey,
      );
      if (!entry) return ctx.fail("NOT_FOUND", "This skill is not in the workspace.");
      const match = librarySkill(entry.librarySkillId);
      const name = match?.name ?? dirNameOf(entry.relativePath);
      return {
        filename: "SKILL.md",
        content: documentFor(
          name,
          entry.description ?? match?.description ?? null,
          entry.status !== "in_sync",
        ),
        files: entry.status === "local_only" ? ["SKILL.md"] : SKILL_FILES,
        path: `${findProject(id).path}/${entry.relativePath}/SKILL.md`,
      };
    },
    "projects.exportSkill": async (skillId: string, id: string, agentKeys?: string[]) => {
      await wait(STEP_MS);
      const skill =
        librarySkill(skillId) ?? ctx.fail("NOT_FOUND", `There is no skill "${skillId}".`);
      const targets = targetsOf(findProject(id)).filter(
        (target) =>
          target.installed &&
          target.enabled &&
          (agentKeys ?? ["claude_code"]).some((key) => target.agentKeys.includes(key)),
      );
      if (targets.length === 0) {
        ctx.fail("INVALID_INPUT", "No enabled installed agents selected for this project");
      }
      for (const target of targets) {
        if (
          copiesOf(id).some(
            (entry) => sameSkill(entry, skill.dirName) && entry.agentKey === target.key,
          )
        ) {
          ctx.fail(
            "ALREADY_EXISTS",
            `Skill "${skill.name}" already exists in this workspace for agent ${target.key}`,
          );
        }
      }
      projectCopies.set(id, [
        ...copiesOf(id),
        ...targets.map((target) =>
          copy(skill.dirName, target.key, "in_sync", { librarySkillId: skill.id }),
        ),
      ]);
      ctx.emitChanged("projects");
    },
    "projects.pushToLibrary": async (
      id: string,
      relativePath: string,
    ): Promise<PushToLibraryResult> => {
      await wait(STEP_MS);
      const variants = copiesOf(id).filter((entry) => sameSkill(entry, relativePath));
      const unsynced = variants.filter((entry) => entry.status !== "in_sync");
      if (unsynced.length > 1) return { conflictingVariants: unsynced.length, realignFailed: 0 };
      const winner = variants.find((entry) => entry.status !== "in_sync");
      if (!winner) return { conflictingVariants: 0, realignFailed: 0 };
      const skill =
        librarySkill(winner.librarySkillId) ??
        importToLibrary(dirNameOf(winner.relativePath), winner.description);
      patchCopies(id, relativePath, (entry) => ({
        ...entry,
        status: "in_sync",
        librarySkillId: skill.id,
      }));
      ctx.emitChanged("skills");
      return { conflictingVariants: 0, realignFailed: 0 };
    },
    "projects.pullFromLibrary": async (id: string, relativePath: string) => {
      await wait(STEP_MS);
      patchCopies(id, relativePath, (entry) =>
        entry.librarySkillId ? { ...entry, status: "in_sync" } : entry,
      );
    },
    "projects.setSkillEnabled": (id: string, relativePath: string, enabled: boolean) => {
      if (!findProject(id).supportsToggle) {
        ctx.fail("UNSUPPORTED", "This workspace does not support disabling skills");
      }
      patchCopies(id, relativePath, (entry) => ({ ...entry, enabled }));
    },
    "projects.deleteSkill": (id: string, relativePath: string, agentKey?: string) => {
      projectCopies.set(
        id,
        copiesOf(id).filter(
          (entry) =>
            !(
              sameSkill(entry, relativePath) &&
              (agentKey === undefined || entry.agentKey === agentKey)
            ),
        ),
      );
      ctx.emitChanged("projects");
    },
    "projects.lastExportAgents": (id: string) => lastExportAgents.get(id) ?? [],
    "projects.setLastExportAgents": (id: string, agentKeys: string[]) => {
      lastExportAgents.set(id, [...new Set(agentKeys)]);
    },
  };
}
