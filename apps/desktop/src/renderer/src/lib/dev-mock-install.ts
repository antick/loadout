/**
 * DEV ONLY. Marketplace, install and scan handlers for the in-memory preview bridge in
 * `dev-mock.ts`. Installs take a moment and report progress so toasts, progress panels and Cancel
 * can be tried in a plain browser. Magic inputs: searching "offline" or cloning a URL containing
 * "offline" fails with NETWORK, "private" fails with GIT_AUTH, "empty" finds no skills.
 */
import {
  MARKETPLACE_URL,
  type BatchImportResult,
  type DiscoveredSkill,
  type ErrorCode,
  type GitPreview,
  type InstallProgress,
  type InstallSelection,
  type MarketBoard,
  type MarketSkill,
  type ScanResult,
  type Skill,
  type SourceType,
} from "@skillboard/shared";
import { HOME, LIBRARY } from "@/lib/dev-mock-data";

export interface InstallMockContext {
  getSkills(): Skill[];
  addSkill(skill: Skill): void;
  emitProgress(progress: InstallProgress): void;
  /** Throw the bridge's error type so the code reaches the renderer. */
  fail(code: ErrorCode, message: string): never;
}

const STEP_MS = 180;
const CLONE_STEPS = 10;
const PERCENT = 100;
const BOARD_SIZE = 60;

const SOURCES = [
  "acme/frontend",
  "acme/agent-skills",
  "northwind/devtools",
  "quietriver/writing",
  "lumen-labs/data-skills",
  "harbor/ops-playbooks",
] as const;
const TOPICS = [
  "react-patterns",
  "api-design",
  "sql-tuning",
  "release-notes",
  "test-writer",
  "pdf-toolkit",
  "changelog",
  "accessibility-audit",
  "docker-compose",
  "incident-report",
  "data-cleaning",
  "meeting-notes",
  "regex-helper",
  "commit-lint",
  "design-tokens",
  "onboarding-guide",
  "log-triage",
  "spreadsheet-formulas",
  "terraform-review",
  "prompt-library",
] as const;

function pick<T>(list: readonly T[], index: number): T {
  return list[index % list.length] as T;
}

const CATALOG: Omit<MarketSkill, "installed">[] = Array.from({ length: 130 }, (_, index) => {
  const source = pick(SOURCES, index * 7 + (index % 3));
  const round = Math.floor(index / TOPICS.length);
  const skillId = round === 0 ? pick(TOPICS, index) : `${pick(TOPICS, index)}-${round + 1}`;
  return {
    id: `${source}/${skillId}`,
    skillId,
    name: skillId,
    source,
    installs: Math.round(980_000 / (index + 1) ** 1.3) + ((index * 37) % 90),
  };
});

const BOARD_ORDER: Record<MarketBoard, (index: number) => number> = {
  all_time: (index) => index,
  hot: (index) => (index * 17) % CATALOG.length,
  trending: (index) => (index * 29 + 11) % CATALOG.length,
};

const DISCOVERED: Omit<DiscoveredSkill, "imported">[] = [
  {
    name: "changelog-writer",
    description: "Turn merged pull requests into a tidy changelog entry.",
    fingerprint: "fp-changelog",
    locations: [
      { agentKey: "claude_code", path: `${HOME}/.claude/skills/changelog-writer` },
      { agentKey: "cursor", path: `${HOME}/.cursor/skills/changelog-writer` },
      { agentKey: "codex", path: `${HOME}/.codex/skills/changelog-writer` },
      { agentKey: "opencode", path: `${HOME}/.config/opencode/skills/changelog-writer` },
    ],
  },
  {
    name: "db-migrations",
    description: "Plan and review schema migrations with a rollback for each step.",
    fingerprint: "fp-migrations",
    locations: [{ agentKey: "codex", path: `${HOME}/.codex/skills/db-migrations` }],
  },
  {
    name: "standup-notes",
    description: null,
    fingerprint: "fp-standup",
    locations: [{ agentKey: "desk_helper", path: `${HOME}/.deskhelper/skills/standup-notes` }],
  },
  {
    name: "broken-frontmatter",
    description: "A skill whose SKILL.md cannot be parsed, to show a failed import.",
    fingerprint: "fp-broken",
    locations: [{ agentKey: "cursor", path: `${HOME}/.cursor/skills/broken-frontmatter` }],
  },
  {
    name: "commit-messages",
    description: "Write conventional commit messages from staged changes.",
    fingerprint: "commit-messages",
    locations: [{ agentKey: "claude_code", path: `${HOME}/.claude/skills/commit-messages` }],
  },
];

const REPO_SKILLS = [
  { relPath: "skills/api-design", name: "api-design", description: "Design REST and RPC APIs." },
  {
    relPath: "skills/code-review",
    name: "code-review",
    description: "Review a diff for correctness, security and style before it merges.",
  },
  { relPath: "skills/log-triage", name: "log-triage", description: null },
  {
    relPath: "experimental/terraform-review",
    name: "terraform-review",
    description: "Check a Terraform plan for risky changes before it is applied.",
  },
] as const;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function baseName(path: string): string {
  return (
    path
      .split(/[\\/]/)
      .findLast(Boolean)
      ?.replace(/\.(zip|skill)$/, "") ?? path
  );
}

export function createInstallMockHandlers(
  ctx: InstallMockContext,
): Record<string, (...args: never[]) => unknown> {
  const cancelled = new Set<string>();
  const running = new Set<string>();
  const importedFingerprints = new Set<string>(["commit-messages"]);
  /** The real backend reports confirm progress under the URL the preview was made from. */
  const previewUrls = new Map<string, string>();

  function makeSkill(name: string, sourceType: SourceType, extra: Partial<Skill> = {}): Skill {
    const existing = ctx.getSkills().find((entry) => entry.name === name);
    const now = Date.now();
    const created: Skill = {
      id: existing?.id ?? name,
      name,
      dirName: name,
      description: `Preview copy of ${name}.`,
      sourceType,
      sourceRef: null,
      sourceUrl: null,
      sourceSubpath: null,
      sourceBranch: null,
      sourceRevision: null,
      remoteRevision: null,
      updateStatus:
        sourceType === "git" || sourceType === "marketplace" ? "up_to_date" : "local_only",
      lastCheckedAt: now,
      lastCheckError: null,
      libraryPath: `${LIBRARY}/skills/${name}`,
      contentHash: name,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      deployments: existing?.deployments ?? [],
      presetIds: existing?.presetIds ?? [],
      tags: existing?.tags ?? [],
      hasConflict: false,
      ...extra,
    };
    ctx.addSkill(created);
    return created;
  }

  function checkCancelled(key: string): void {
    if (cancelled.delete(key)) ctx.fail("CANCELLED", "The install was cancelled.");
  }

  async function clone(key: string): Promise<void> {
    for (let step = 0; step <= CLONE_STEPS; step += 1) {
      checkCancelled(key);
      ctx.emitProgress({
        key,
        phase: "cloning",
        current: (step * PERCENT) / CLONE_STEPS,
        total: PERCENT,
      });
      await wait(STEP_MS);
    }
  }

  /** Track the key so `install.cancel` can answer whether anything was running. */
  async function tracked<T>(key: string, work: () => Promise<T>): Promise<T> {
    running.add(key);
    try {
      return await work();
    } finally {
      running.delete(key);
      cancelled.delete(key);
    }
  }

  function withInstalled(entries: Omit<MarketSkill, "installed">[]): MarketSkill[] {
    const installed = new Set(
      ctx
        .getSkills()
        .filter((entry) => entry.sourceType === "marketplace")
        .map((entry) => entry.sourceRef),
    );
    return entries.map((entry) => ({ ...entry, installed: installed.has(entry.id) }));
  }

  function scanResult(): ScanResult {
    const skills = DISCOVERED.map((entry) => ({
      ...entry,
      imported: importedFingerprints.has(entry.fingerprint),
    }));
    return {
      agentsScanned: 5,
      skillsFound: skills.reduce((sum, entry) => sum + entry.locations.length, 0),
      skills,
    };
  }

  function importGroup(group: Omit<DiscoveredSkill, "imported">, name?: string): Skill {
    if (group.fingerprint === "fp-broken") {
      ctx.fail("INVALID_INPUT", "SKILL.md has front matter that cannot be read.");
    }
    importedFingerprints.add(group.fingerprint);
    return makeSkill(name?.trim() || group.name, "import", {
      description: group.description,
      sourceRef: group.locations[0]?.path ?? null,
    });
  }

  return {
    "app.pickArchive": () => `${HOME}/Downloads/pdf-toolkit.skill`,

    "market.board": (board: MarketBoard) =>
      withInstalled(
        Array.from({ length: BOARD_SIZE }, (_, index) => pick(CATALOG, BOARD_ORDER[board](index))),
      ),
    "market.search": (query: string, limit?: number) => {
      const needle = query.trim().toLowerCase();
      if (needle === "offline") ctx.fail("NETWORK", `Could not resolve host: ${MARKETPLACE_URL}`);
      return withInstalled(
        CATALOG.filter((entry) => entry.id.toLowerCase().includes(needle)).slice(0, limit ?? 50),
      );
    },

    "install.fromMarket": (source: string, skillId: string) => {
      const key = `${source}/${skillId}`;
      return tracked(key, async () => {
        await clone(key);
        ctx.emitProgress({ key, phase: "installing", name: skillId });
        await wait(STEP_MS * 2);
        checkCancelled(key);
        ctx.emitProgress({ key, phase: "done", name: skillId });
        return makeSkill(skillId, "marketplace", {
          sourceRef: key,
          sourceUrl: `https://github.com/${source}.git`,
          sourceRevision: "a1b2c3d",
        });
      });
    },
    "install.fromPath": async (sourcePath: string, name?: string) => {
      await wait(STEP_MS * 3);
      return makeSkill(name?.trim() || baseName(sourcePath), "local", { sourceRef: sourcePath });
    },
    "install.importFolder": async (folderPath: string): Promise<BatchImportResult> => {
      const names = ["api-design", "commit-messages", "log-triage", "regex-helper", "bad-skill"];
      const result: BatchImportResult = { imported: 0, skipped: 0, errors: [] };
      for (const [index, name] of names.entries()) {
        ctx.emitProgress({
          key: folderPath,
          phase: "installing",
          current: index + 1,
          total: names.length,
          name,
        });
        await wait(STEP_MS * 3);
        if (name === "bad-skill") {
          result.errors.push({ name, message: "SKILL.md has front matter that cannot be read." });
        } else if (ctx.getSkills().some((entry) => entry.name === name)) result.skipped += 1;
        else {
          makeSkill(name, "local", { sourceRef: `${folderPath}/${name}` });
          result.imported += 1;
        }
      }
      ctx.emitProgress({ key: folderPath, phase: "done" });
      return result;
    },

    "install.previewGit": (repoUrl: string) =>
      tracked(repoUrl, async (): Promise<GitPreview> => {
        if (repoUrl.includes("offline")) ctx.fail("NETWORK", "Could not resolve host.");
        await clone(repoUrl);
        if (repoUrl.includes("private")) {
          ctx.fail("GIT_AUTH", "The repository refused access: authentication failed.");
        }
        ctx.emitProgress({ key: repoUrl, phase: "scanning" });
        await wait(STEP_MS * 3);
        checkCancelled(repoUrl);
        const names = new Set(ctx.getSkills().map((entry) => entry.name));
        const previewId = `preview-${Date.now()}`;
        previewUrls.set(previewId, repoUrl);
        return {
          previewId,
          repoUrl,
          branch: repoUrl.includes("/tree/") ? "main" : null,
          revision: "4f2a9c1d8e7b6a5f4e3d2c1b0a9f8e7d6c5b4a39",
          skills: repoUrl.includes("empty")
            ? []
            : REPO_SKILLS.map((entry) => ({ ...entry, alreadyInstalled: names.has(entry.name) })),
        };
      }),
    "install.confirmGit": async (previewId: string, items: InstallSelection[]) => {
      const installed: Skill[] = [];
      const key = previewUrls.get(previewId);
      if (!key) return ctx.fail("INVALID_INPUT", "The preview has expired. Clone again.");
      previewUrls.delete(previewId);
      for (const [index, item] of items.entries()) {
        ctx.emitProgress({
          key,
          phase: "installing",
          current: index + 1,
          total: items.length,
          name: item.name,
        });
        await wait(STEP_MS * 3);
        installed.push(
          makeSkill(item.name, "git", {
            description: REPO_SKILLS.find((entry) => entry.relPath === item.relPath)?.description,
            sourceUrl: "https://github.com/acme/agent-skills.git",
            sourceSubpath: item.relPath,
            sourceRevision: "4f2a9c1",
          }),
        );
      }
      return installed;
    },
    "install.cancelPreview": (previewId: string) => void previewUrls.delete(previewId),
    "install.cancel": (key: string) => {
      if (!running.has(key)) return false;
      cancelled.add(key);
      return true;
    },

    "install.scanLocal": async () => {
      await wait(STEP_MS * 3);
      return scanResult();
    },
    "install.importDiscovered": async (path: string, name?: string) => {
      await wait(STEP_MS * 4);
      const group = DISCOVERED.find((entry) => entry.locations.some((l) => l.path === path));
      if (!group) return ctx.fail("NOT_FOUND", `Nothing was found at ${path}.`);
      return importGroup(group, name);
    },
    "install.importAllDiscovered": async (): Promise<BatchImportResult> => {
      await wait(STEP_MS * 6);
      const result: BatchImportResult = { imported: 0, skipped: 0, errors: [] };
      for (const group of DISCOVERED) {
        if (importedFingerprints.has(group.fingerprint)) continue;
        try {
          importGroup(group);
          result.imported += 1;
        } catch (error) {
          result.errors.push({
            name: group.name,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
      return result;
    },
  };
}
