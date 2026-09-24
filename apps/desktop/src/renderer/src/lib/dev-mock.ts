/**
 * DEV ONLY. A fake `window.loadout` with a little in-memory data so the UI can be previewed in
 * a plain browser. Loaded from `main.tsx` behind `import.meta.env.DEV`, so production builds drop
 * it. Anything not listed in `handlers` answers with an UNSUPPORTED error.
 */
import {
  type ApiResponse,
  type AppEventName,
  type ApplyResult,
  APP_NAME,
  type DataScope,
  DEFAULT_SETTINGS,
  type ErrorCode,
  type Preset,
  type PresetInput,
  type Settings,
  type Skill,
} from "@loadout/shared";
import {
  deployment,
  HOME,
  SEED_AGENTS,
  SEED_APP_UPDATE,
  SEED_BACKUP_STATUS,
  SEED_LIBRARY_LOCATION,
  SEED_PRESETS,
  SEED_PROJECTS,
  SEED_SKILLS,
} from "@/lib/dev-mock-data";
import { createEditorMockHandlers } from "@/lib/dev-mock-editor";
import { createInstallMockHandlers } from "@/lib/dev-mock-install";
import { withInstructionMocks } from "@/lib/dev-mock-instructions";
import { createStorageMockHandlers } from "@/lib/dev-mock-storage";
import { createLibraryMockHandlers } from "@/lib/dev-mock-library";
import { createWorkspaceMockHandlers } from "@/lib/dev-mock-workspaces";
import { createSystemMockHandlers } from "@/lib/dev-mock-system";

const LATENCY_MS = 120;

type Listener = (event: AppEventName, payload: unknown) => void;
const listeners = new Set<Listener>();

class MockError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

const agents = SEED_AGENTS;
let skills = SEED_SKILLS;
let presets = SEED_PRESETS;
let projects = SEED_PROJECTS;
let settings: Settings = { ...DEFAULT_SETTINGS };

function emitChanged(...scope: DataScope[]): void {
  for (const listener of listeners) listener("data:changed", { scope });
}

function findSkill(skillId: string): Skill {
  const found = skills.find((entry) => entry.id === skillId);
  if (!found) throw new MockError("NOT_FOUND", `There is no skill "${skillId}".`);
  return found;
}

function setDeployed(skillId: string, agentKey: string, on: boolean): boolean {
  const target = findSkill(skillId);
  const has = target.deployments.some((entry) => entry.agentKey === agentKey);
  if (has === on) return false;
  const deployments = on
    ? [...target.deployments, deployment(skillId, agentKey)]
    : target.deployments.filter((entry) => entry.agentKey !== agentKey);
  skills = skills.map((entry) => (entry.id === skillId ? { ...entry, deployments } : entry));
  return true;
}

function withPresetIds(list: Skill[]): Skill[] {
  return list.map((entry) => ({
    ...entry,
    presetIds: presets
      .filter((preset) => preset.skillIds.includes(entry.id))
      .map((preset) => preset.id),
  }));
}

function reorder<T extends { id: string; sortOrder: number }>(items: T[], ids: string[]): T[] {
  return ids.flatMap((id, index) => {
    const item = items.find((entry) => entry.id === id);
    return item ? [{ ...item, sortOrder: index }] : [];
  });
}

const SAMPLE_DOCUMENT = (name: string, description: string | null): string =>
  `---\nname: ${name}\ndescription: ${description ?? ""}\n---\n\n# ${name}\n\n${description ?? ""}\n\n## Steps\n\n1. Read the request.\n2. Do the work in small steps.\n3. Check the result.\n\n\`\`\`sh\necho "done"\n\`\`\`\n`;

// `never[]` accepts handlers with any parameter list; arguments arrive untyped over the fake bridge.
const handlers: Record<string, (...args: never[]) => unknown> = {
  // `?platform=win32` previews Windows-only hints such as the WSL folder note.
  "app.info": () => ({
    name: APP_NAME,
    version: "0.1.0-dev",
    platform: new URLSearchParams(window.location.search).get("platform") ?? "darwin",
    homeDir: HOME,
  }),
  "app.updateStatus": () => SEED_APP_UPDATE,
  "app.checkUpdate": () => SEED_APP_UPDATE,
  "app.downloadUpdate": () => SEED_APP_UPDATE,
  "app.cancelUpdate": () => SEED_APP_UPDATE,
  "app.installUpdate": () => undefined,
  "app.copyText": (text: string) => void navigator.clipboard?.writeText(text),
  "app.openExternal": (url: string) => void window.open(url, "_blank", "noopener"),
  "app.pickFolder": () => `${HOME}/code/new-project`,

  "agents.list": () => agents,
  "skills.list": () => withPresetIds(skills),
  "skills.get": (skillId: string) => withPresetIds([findSkill(skillId)])[0],
  "skills.document": (skillId: string) => {
    const found = findSkill(skillId);
    return {
      filename: "SKILL.md",
      content: SAMPLE_DOCUMENT(found.name, found.description),
      files: ["SKILL.md", "config.yaml", "references/", "scripts/"],
      path: `${found.libraryPath}/SKILL.md`,
    };
  },
  "skills.allTags": () => [...new Set(skills.flatMap((entry) => entry.tags))].sort(),
  "skills.setTags": (skillId: string, tags: string[]) => {
    skills = skills.map((entry) => (entry.id === skillId ? { ...entry, tags } : entry));
    emitChanged("skills");
  },
  "skills.renameTag": (from: string, to: string) => {
    skills = skills.map((entry) => ({
      ...entry,
      tags: [...new Set(entry.tags.map((tag) => (tag === from ? to : tag)))],
    }));
    emitChanged("skills");
  },
  "skills.deleteTag": (tag: string) => {
    skills = skills.map((entry) => ({
      ...entry,
      tags: entry.tags.filter((candidate) => candidate !== tag),
    }));
    emitChanged("skills");
  },
  "skills.removeMany": (skillIds: string[]) => {
    skills = skills.filter((entry) => !skillIds.includes(entry.id));
    emitChanged("skills", "presets");
    return { succeeded: skillIds.length, failed: [] };
  },

  "deploy.deploy": (skillId: string, agentKey: string) => {
    if (skillId === "release-notes") {
      throw new MockError(
        "TARGET_CONFLICT",
        "A folder that was not installed from the library is in the way.",
      );
    }
    setDeployed(skillId, agentKey, true);
    emitChanged("skills");
  },
  "deploy.undeploy": (skillId: string, agentKey: string) => {
    setDeployed(skillId, agentKey, false);
    emitChanged("skills");
  },
  "deploy.apply": (
    skillIds: string[],
    agentKeys: string[],
    action: "add" | "remove",
  ): ApplyResult => {
    const result: ApplyResult = { added: 0, removed: 0, skipped: 0, conflicts: [], failed: [] };
    for (const skillId of skillIds) {
      for (const agentKey of agentKeys) {
        if (!setDeployed(skillId, agentKey, action === "add")) result.skipped += 1;
        else if (action === "add") result.added += 1;
        else result.removed += 1;
      }
    }
    emitChanged("skills");
    return result;
  },

  "presets.list": () => [...presets].sort((a, b) => a.sortOrder - b.sortOrder),
  "presets.create": (input: PresetInput) => {
    const created: Preset = {
      id: `p-${Date.now()}`,
      name: input.name,
      description: input.description ?? null,
      icon: input.icon ?? null,
      sortOrder: presets.length,
      skillIds: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    presets = [...presets, created];
    emitChanged("presets");
    return created;
  },
  "presets.update": (id: string, input: PresetInput) => {
    presets = presets.map((entry) =>
      entry.id === id
        ? {
            ...entry,
            name: input.name,
            description: input.description ?? null,
            icon: input.icon ?? null,
          }
        : entry,
    );
    emitChanged("presets");
    return presets.find((entry) => entry.id === id);
  },
  "presets.remove": (id: string) => {
    presets = presets.filter((entry) => entry.id !== id);
    emitChanged("presets");
  },
  "presets.reorder": (ids: string[]) => {
    presets = reorder(presets, ids);
  },

  "projects.list": () => [...projects].sort((a, b) => a.sortOrder - b.sortOrder),
  "projects.remove": (id: string) => {
    projects = projects.filter((entry) => entry.id !== id);
    emitChanged("projects");
  },
  "projects.reorder": (ids: string[]) => {
    projects = reorder(projects, ids);
  },

  "workspace.counts": (agentKeys: string[]) =>
    Object.fromEntries(
      agentKeys.map((key) => [
        key,
        skills.filter((entry) => entry.deployments.some((d) => d.agentKey === key)).length,
      ]),
    ),

  "settings.all": () => settings,
  "settings.get": (key: keyof Settings) => settings[key],
  "settings.set": (key: keyof Settings, value: never) => {
    settings = { ...settings, [key]: value };
    emitChanged("settings");
  },

  // "Save as" answers with the suggested name in Downloads; the export pretends to write it.
  "app.pickSavePath": (defaultName: string) => `${HOME}/Downloads/${defaultName}`,
  "skills.exportArchive": (skillIds: string[], destPath: string) => ({
    path: destPath,
    skillCount: new Set(skillIds).size,
    bytes: 18_432 * new Set(skillIds).size,
  }),

  "system.libraryLocation": () => SEED_LIBRARY_LOCATION,
  "system.lastCrash": () => null,
  "backup.status": () => SEED_BACKUP_STATUS,
  "backup.sync": () => ({ committed: true, merge: null, pushed: true, snapshot: null }),
};

// Calls that only need to succeed, and lists that are empty in the preview.
for (const channel of [
  "app.revealPath",
  "app.resolveClose",
  "skills.reveal",
  "projects.reveal",
  "system.clearLastCrash",
]) {
  handlers[channel] = () => undefined;
}
for (const channel of [
  "projects.skills",
  "projects.targets",
  "workspace.list",
  "system.activity",
]) {
  handlers[channel] = () => [];
}

Object.assign(
  handlers,
  createInstallMockHandlers({
    getSkills: () => skills,
    addSkill: (added) => {
      skills = [...skills.filter((entry) => entry.id !== added.id), added];
      emitChanged("skills");
    },
    emitProgress: (progress) => {
      for (const listener of listeners) listener("install:progress", progress);
    },
    fail: (code, message) => {
      throw new MockError(code, message);
    },
  }),
);

// Registered after the install handlers: it takes over `install.cancel` for update keys only.
const cancelInstall = handlers["install.cancel"] as ((key: string) => unknown) | undefined;
Object.assign(
  handlers,
  createLibraryMockHandlers({
    getSkills: () => skills,
    setSkills: (next) => {
      skills = next;
    },
    getPresets: () => presets,
    setPresets: (next) => {
      presets = next;
    },
    getAgents: () => agents,
    setDeployed,
    emitChanged,
    emitProgress: (progress) => {
      for (const listener of listeners) listener("install:progress", progress);
    },
    emitAutoRan: (payload) => {
      for (const listener of listeners) listener("updates:auto-ran", payload);
    },
    fail: (code, message) => {
      throw new MockError(code, message);
    },
    cancelElsewhere: (key) => cancelInstall?.(key) ?? false,
  }),
);

// Backup, settings, agents and system: replaces the simple `backup.*` and `agents.list` stubs above.
Object.assign(
  handlers,
  createSystemMockHandlers({
    getSkills: () => skills,
    setSkills: (next) => {
      skills = next;
    },
    agents,
    getSettings: () => settings,
    emitChanged,
    fail: (code, message) => {
      throw new MockError(code, message);
    },
  }),
);

// Registered last: the agent and project pages need fuller `workspace.*` / `projects.*` data than
// the stubs above, and everything else that reads project skills gets the same copies.
Object.assign(
  handlers,
  createWorkspaceMockHandlers({
    getSkills: () => skills,
    setSkills: (next) => {
      skills = next;
    },
    getAgents: () => agents,
    getProjects: () => projects,
    setProjects: (next) => {
      projects = next;
    },
    setDeployed,
    emitChanged,
    fail: (code, message) => {
      throw new MockError(code, message);
    },
  }),
);

Object.assign(
  handlers,
  withInstructionMocks(
    {
      home: HOME,
      getAgents: () => agents,
      getProjects: () => projects,
      fail: (code, message) => {
        throw new MockError(code, message);
      },
    },
    createEditorMockHandlers({
      getSkills: () => skills,
      setSkills: (next) => {
        skills = next;
      },
      emitChanged,
      fail: (code, message) => {
        throw new MockError(code, message);
      },
      document: (skill) => SAMPLE_DOCUMENT(skill.name, skill.description),
    }),
  ),
);

Object.assign(handlers, createStorageMockHandlers(HOME));

/** Install the fake bridge. Call only in development, and only when the real one is missing. */
export function installDevMock(): void {
  window.loadout = {
    // A plain browser never reveals real paths; the name is enough for the mock.
    pathForFile: (file) => `/mock/${(file as File).name}`,
    invoke: (channel, args) =>
      new Promise<ApiResponse<unknown>>((resolve) => {
        // Async so handlers that take a while (installs with progress) can return a promise.
        window.setTimeout(async () => {
          const handler = handlers[channel];
          try {
            if (!handler)
              throw new MockError("UNSUPPORTED", `The preview has no data for "${channel}".`);
            resolve({ ok: true, value: await handler(...(args as never[])) });
          } catch (error) {
            const code = error instanceof MockError ? error.code : "INTERNAL";
            const details =
              code === "TARGET_CONFLICT"
                ? {
                    conflicts: [
                      {
                        path: `${HOME}/.claude/skills/release-notes`,
                        reason: "not installed from the library",
                      },
                    ],
                  }
                : undefined;
            resolve({
              ok: false,
              error: {
                code,
                message: error instanceof Error ? error.message : String(error),
                details,
              },
            });
          }
        }, LATENCY_MS);
      }),
    on: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  console.info("[dev] Using the in-memory preview bridge.");
}
