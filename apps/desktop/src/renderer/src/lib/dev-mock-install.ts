/**
 * DEV ONLY. Install and scan handlers for the in-memory preview bridge in
 * `dev-mock.ts`. Installs take a moment and report progress so toasts, progress panels and Cancel
 * can be tried in a plain browser. Magic inputs: cloning a URL containing
 * "offline" fails with NETWORK, "private" fails with GIT_AUTH, "empty" finds no skills. A link
 * ending in an archive extension is treated as an archive; an archive whose name contains "bundle"
 * holds several skills. A repository typed as `owner/repo@name` ticks only that skill. A link to a
 * SKILL.md holds one skill; any other web address is a site with three. A link containing "moved"
 * was redirected to another site, so confirming needs `acceptRedirect`.
 */
import {
  type BatchImportResult,
  type ConfirmOptions,
  type DiscoveredSkill,
  type ErrorCode,
  type GitPreview,
  type InstallProgress,
  type InstallSelection,
  type ScanResult,
  type Skill,
  type SourceType,
} from "@loadout/shared";
import { guessSource } from "@/features/install/source-guess";
import { HOME, LIBRARY } from "@/lib/dev-mock-data";
import { createMarketMockHandlers } from "@/lib/dev-mock-market";

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

/** `owner/repo@skill` or `…#main@skill` → the skill to tick, as the real parser reads it. */
function namedSkill(text: string): string | null {
  const at = text.lastIndexOf("@");
  return at > text.lastIndexOf("/") && at > text.indexOf(":") ? text.slice(at + 1) || null : null;
}

/** What the real backend reports for a named skill: which rows to tick, which names are absent. */
function requested(
  skills: GitPreview["skills"],
  name: string | null,
): Pick<GitPreview, "selected" | "missing"> {
  if (!name) return { selected: null, missing: [] };
  const matches = skills.filter((entry) => entry.name === name).map((entry) => entry.relPath);
  return { selected: matches, missing: matches.length > 0 ? [] : [name] };
}

const MOVED_TO_HOST = "files.elsewhere.net";

const SITE_SKILLS = [
  { relPath: "orders", name: "orders", description: "Look up and refund orders." },
  { relPath: "catalog", name: "catalog", description: "Search the product catalog." },
  { relPath: "support", name: "support", description: "Answer support tickets in house style." },
] as const;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function baseName(path: string): string {
  return (
    path
      .split(/[\\/]/)
      .findLast(Boolean)
      ?.replace(/\.(zip|skill|tar\.gz|tgz|tar)$/, "") ?? path
  );
}

export function createInstallMockHandlers(
  ctx: InstallMockContext,
): Record<string, (...args: never[]) => unknown> {
  const cancelled = new Set<string>();
  const running = new Set<string>();
  const importedFingerprints = new Set<string>(["commit-messages"]);
  /** The real backend reports confirm progress under the URL the preview was made from. */
  const previewUrls = new Map<
    string,
    { key: string; kind: GitPreview["kind"]; local: boolean; redirectedTo?: string | null }
  >();

  /** Skills a mock archive holds: several for a "bundle", else one named after the file. */
  function archiveSkills(source: string): GitPreview["skills"] {
    const names = new Set(ctx.getSkills().map((entry) => entry.name));
    const skills = source.includes("bundle")
      ? REPO_SKILLS.map(({ relPath, name, description }) => ({
          relPath: relPath.split("/").at(-1) ?? relPath,
          name,
          description,
        }))
      : [{ relPath: baseName(source), name: baseName(source), description: "From an archive." }];
    return skills.map((entry) => ({ ...entry, alreadyInstalled: names.has(entry.name) }));
  }

  /** Skills of a web source that is not a repository: an archive, a lone SKILL.md or a site. */
  function webSkills(
    kind: GitPreview["kind"],
    url: string,
    names: ReadonlySet<string>,
  ): GitPreview["skills"] {
    if (kind === "archive") return archiveSkills(url);
    if (kind === "site") {
      return SITE_SKILLS.map((entry) => ({ ...entry, alreadyInstalled: names.has(entry.name) }));
    }
    const folder = url.split("/").at(-2) ?? "skill";
    return [
      { relPath: folder, name: folder, description: "From a link.", alreadyInstalled: false },
    ];
  }

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
      editedFiles: [],
      issues: [],
      ...extra,
    };
    ctx.addSkill(created);
    return created;
  }

  function checkCancelled(key: string): void {
    if (cancelled.delete(key)) ctx.fail("CANCELLED", "The install was cancelled.");
  }

  async function clone(key: string, phase: "cloning" | "downloading" = "cloning"): Promise<void> {
    for (let step = 0; step <= CLONE_STEPS; step += 1) {
      checkCancelled(key);
      ctx.emitProgress({
        key,
        phase,
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
    ...createMarketMockHandlers(ctx),
    "app.pickArchive": () => `${HOME}/Downloads/pdf-toolkit.skill`,

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
        const kind = guessSource(repoUrl);
        await clone(repoUrl, kind === "repository" ? "cloning" : "downloading");
        if (repoUrl.includes("private")) {
          ctx.fail("GIT_AUTH", "The repository refused access: authentication failed.");
        }
        ctx.emitProgress({ key: repoUrl, phase: "scanning" });
        await wait(STEP_MS * 3);
        checkCancelled(repoUrl);
        const names = new Set(ctx.getSkills().map((entry) => entry.name));
        const previewId = `preview-${Date.now()}`;
        const redirectedTo = repoUrl.includes("moved") ? MOVED_TO_HOST : null;
        previewUrls.set(previewId, { key: repoUrl, kind, local: false, redirectedTo });
        if (kind !== "repository") {
          const skills = repoUrl.includes("empty") ? [] : webSkills(kind, repoUrl, names);
          return {
            previewId,
            kind,
            repoUrl: repoUrl.trim(),
            branch: null,
            revision: null,
            skills,
            ...requested(skills, null),
            redirectedTo,
          };
        }
        const skills = repoUrl.includes("empty")
          ? []
          : REPO_SKILLS.map((entry) => ({ ...entry, alreadyInstalled: names.has(entry.name) }));
        return {
          previewId,
          kind,
          repoUrl,
          branch: repoUrl.includes("/tree/") || repoUrl.includes("#") ? "main" : null,
          revision: "4f2a9c1d8e7b6a5f4e3d2c1b0a9f8e7d6c5b4a39",
          skills,
          ...requested(skills, namedSkill(repoUrl)),
          redirectedTo: null,
        };
      }),
    "install.previewArchive": async (archivePath: string): Promise<GitPreview> => {
      await wait(STEP_MS * 2);
      const previewId = `preview-${Date.now()}`;
      previewUrls.set(previewId, { key: archivePath, kind: "archive", local: true });
      return {
        previewId,
        kind: "archive",
        repoUrl: archivePath,
        branch: null,
        revision: null,
        skills: archiveSkills(archivePath),
        selected: null,
        missing: [],
        redirectedTo: null,
      };
    },
    "install.confirmGit": async (
      previewId: string,
      items: InstallSelection[],
      options?: ConfirmOptions,
    ) => {
      const installed: Skill[] = [];
      const preview = previewUrls.get(previewId);
      if (!preview) return ctx.fail("INVALID_INPUT", "The preview has expired. Try again.");
      if (preview.redirectedTo && !options?.acceptRedirect) {
        return ctx.fail("INVALID_INPUT", `The download moved to ${preview.redirectedTo}.`);
      }
      previewUrls.delete(previewId);
      for (const [index, item] of items.entries()) {
        ctx.emitProgress({
          key: preview.key,
          phase: "installing",
          current: index + 1,
          total: items.length,
          name: item.name,
        });
        await wait(STEP_MS * 3);
        const description = REPO_SKILLS.find((entry) => entry.name === item.relPath)?.description;
        if (preview.kind !== "repository") {
          installed.push(
            makeSkill(item.name, preview.local ? "local" : "url", {
              description,
              sourceRef: preview.key.trim(),
              sourceUrl: preview.local ? null : preview.key.trim(),
              sourceSubpath: item.relPath,
            }),
          );
          continue;
        }
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
