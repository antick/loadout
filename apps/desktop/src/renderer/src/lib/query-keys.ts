import type { MarketBoard } from "@loadout/shared";

/**
 * Every TanStack Query key in the app. Each namespace has a `root` prefix (use it to invalidate the
 * whole namespace) and specific keys underneath it.
 */
export const keys = {
  skills: {
    root: ["skills"] as const,
    all: ["skills", "all"] as const,
    detail: (skillId: string) => ["skills", "detail", skillId] as const,
    document: (skillId: string) => ["skills", "document", skillId] as const,
    tags: ["skills", "tags"] as const,
  },
  editor: {
    root: ["editor"] as const,
    target: (location: string) => ["editor", "target", location] as const,
    files: (location: string) => ["editor", "files", location] as const,
    file: (location: string, path: string) => ["editor", "file", location, path] as const,
    versions: (location: string, path: string) => ["editor", "versions", location, path] as const,
  },
  storage: {
    root: ["storage"] as const,
    report: ["storage", "report"] as const,
  },
  instructions: {
    root: ["instructions"] as const,
    list: (projectId: string | null) => ["instructions", "list", projectId ?? ""] as const,
  },
  agents: {
    root: ["agents"] as const,
    all: ["agents", "all"] as const,
  },
  presets: {
    root: ["presets"] as const,
    all: ["presets", "all"] as const,
    toggles: (presetId: string, skillId: string) =>
      ["presets", "toggles", presetId, skillId] as const,
  },
  projects: {
    root: ["projects"] as const,
    all: ["projects", "all"] as const,
    suggestions: ["projects", "suggestions"] as const,
    skillsRoot: ["projects", "skills"] as const,
    skills: (projectId: string) => ["projects", "skills", projectId] as const,
    targets: (projectId: string) => ["projects", "targets", projectId] as const,
    document: (projectId: string, relativePath: string, agentKey: string) =>
      ["projects", "document", projectId, relativePath, agentKey] as const,
    lastExportAgents: (projectId: string) => ["projects", "last-export-agents", projectId] as const,
  },
  workspace: {
    root: ["workspace"] as const,
    list: (agentKey: string) => ["workspace", "list", agentKey] as const,
    broken: (agentKey: string) => ["workspace", "broken", agentKey] as const,
    counts: ["workspace", "counts"] as const,
    document: (agentKey: string, relativePath: string) =>
      ["workspace", "document", agentKey, relativePath] as const,
  },
  updates: {
    root: ["updates"] as const,
    sourceDocument: (skillId: string) => ["updates", "source-document", skillId] as const,
    sourceDiff: (skillId: string) => ["updates", "source-diff", skillId] as const,
  },
  market: {
    root: ["market"] as const,
    board: (board: MarketBoard) => ["market", "board", board] as const,
    search: (query: string) => ["market", "search", query] as const,
    detail: (id: string) => ["market", "detail", id] as const,
  },
  backup: {
    root: ["backup"] as const,
    status: ["backup", "status"] as const,
    snapshots: ["backup", "snapshots"] as const,
    conflicts: ["backup", "conflicts"] as const,
    size: ["backup", "size"] as const,
    device: ["backup", "device"] as const,
    authMethod: ["backup", "auth-method"] as const,
    deviceAvailable: ["backup", "device-available"] as const,
  },
  settings: {
    root: ["settings"] as const,
    all: ["settings", "all"] as const,
  },
  system: {
    root: ["system"] as const,
    libraryLocation: ["system", "library-location"] as const,
    activity: (limit?: number) => ["system", "activity", limit ?? null] as const,
    diagnostics: ["system", "diagnostics"] as const,
    logExcerpt: ["system", "log-excerpt"] as const,
    lastCrash: ["system", "last-crash"] as const,
    cliStatus: ["system", "cli-status"] as const,
    agentControl: ["system", "agent-control"] as const,
  },
  install: {
    root: ["install"] as const,
    scan: ["install", "scan"] as const,
  },
  app: {
    root: ["app"] as const,
    info: ["app", "info"] as const,
    update: ["app", "update"] as const,
  },
} as const;
