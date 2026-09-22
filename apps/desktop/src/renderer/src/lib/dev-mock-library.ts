/**
 * DEV ONLY. Update and preset-membership handlers for the in-memory preview
 * bridge in `dev-mock.ts`, so the Library and Preset pages can be tried in a plain browser.
 * Magic skills: updating "code-review" asks to approve removed files; "sql-migrations" does too and
 * answers the first approval with a changed list (a stale token); checking "release-notes" fails;
 * comparing "commit-messages" fails as if its source folder were gone.
 */
import type {
  AgentInfo,
  ApplyResult,
  AppEvents,
  BatchResult,
  BatchUpdateResult,
  ErrorCode,
  InstallProgress,
  PendingRemoval,
  Preset,
  PresetAgentToggle,
  PresetDeployStatus,
  Skill,
  SourceDiff,
  SourceDocument,
  UpdateResult,
} from "@loadout/shared";
import { HOME } from "@/lib/dev-mock-data";

export interface LibraryMockContext {
  getSkills(): Skill[];
  setSkills(next: Skill[]): void;
  getPresets(): Preset[];
  setPresets(next: Preset[]): void;
  getAgents(): AgentInfo[];
  /** Deploy or remove one pair; false when it was already in the wanted state. */
  setDeployed(skillId: string, agentKey: string, on: boolean): boolean;
  emitChanged(...scope: ("skills" | "presets")[]): void;
  emitProgress(progress: InstallProgress): void;
  emitAutoRan(payload: AppEvents["updates:auto-ran"]): void;
  fail(code: ErrorCode, message: string): never;
  /** `install.cancel` of the other mock modules, for keys this module does not own. */
  cancelElsewhere(key: string): unknown;
}

const STEP_MS = 450;
const UPDATE_KEY_PREFIX = "update:";
const AUTO_RAN_DELAY_MS = 6000;
const NEW_REVISION = "9be01d7c2a41";
const GUARDED_SKILL = "code-review";
const STALE_TOKEN_SKILL = "sql-migrations";
const FAILING_CHECK_SKILL = "release-notes";
const OFFLINE_SOURCE_SKILL = "commit-messages";

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => window.setTimeout(resolve, ms));

const isRemote = (skill: Skill): boolean =>
  skill.sourceType === "git" || skill.sourceType === "marketplace";

const sampleDocument = (name: string, extra: string): string =>
  `---\nname: ${name}\ndescription: Upstream copy of ${name}.\n---\n\n# ${name}\n\n## Steps\n\n1. Read the request.\n2. Do the work in small steps.\n3. Check the result twice.\n${extra}`;

function removalsFor(skill: Skill, round: number): PendingRemoval[] {
  const removals: PendingRemoval[] = [
    { location: "library", path: "scripts/legacy-check.sh", kind: "removed" },
    { location: "library", path: "references/", kind: "removed" },
  ];
  if (skill.editedFiles.includes("SKILL.md")) {
    removals.push({ location: "library", path: "SKILL.md", kind: "edited" });
  }
  if (round > 0)
    removals.push({ location: "library", path: "templates/old-report.md", kind: "removed" });
  const copyAgent = skill.deployments[0]?.agentKey;
  if (copyAgent)
    removals.push({ location: copyAgent, path: "scripts/legacy-check.sh", kind: "removed" });
  return removals;
}

export function createLibraryMockHandlers(
  ctx: LibraryMockContext,
): Record<string, (...args: never[]) => unknown> {
  const running = new Set<string>();
  const cancelled = new Set<string>();
  const approvalRounds = new Map<string, number>();
  const toggleOff = new Set<string>();
  // Give two local skills a source folder so Re-import, Relink, Detach and Compare have something.
  ctx.setSkills(
    ctx.getSkills().map((skill) => {
      if (skill.id === "api-docs") return { ...skill, sourceRef: `${HOME}/code/skills/api-docs` };
      if (skill.id === OFFLINE_SOURCE_SKILL)
        return { ...skill, sourceRef: `${HOME}/old-disk/commit-messages` };
      return skill;
    }),
  );

  window.setTimeout(
    () => ctx.emitAutoRan({ ranAt: Date.now(), updated: 1, available: 1, failed: 0 }),
    AUTO_RAN_DELAY_MS,
  );

  function find(skillId: string): Skill {
    const found = ctx.getSkills().find((entry) => entry.id === skillId);
    return found ?? ctx.fail("NOT_FOUND", `There is no skill "${skillId}".`);
  }

  function patch(skillId: string, changes: Partial<Skill>): Skill {
    ctx.setSkills(
      ctx.getSkills().map((entry) => (entry.id === skillId ? { ...entry, ...changes } : entry)),
    );
    ctx.emitChanged("skills");
    return find(skillId);
  }

  function findPreset(id: string): Preset {
    const found = ctx.getPresets().find((entry) => entry.id === id);
    return found ?? ctx.fail("NOT_FOUND", `There is no preset "${id}".`);
  }

  function patchPreset(id: string, skillIds: string[]): void {
    findPreset(id);
    ctx.setPresets(
      ctx
        .getPresets()
        .map((entry) => (entry.id === id ? { ...entry, skillIds, updatedAt: Date.now() } : entry)),
    );
    ctx.emitChanged("presets", "skills");
  }

  async function phases(key: string, list: InstallProgress["phase"][]): Promise<void> {
    running.add(key);
    try {
      for (const phase of list) {
        if (cancelled.delete(key)) ctx.fail("CANCELLED", "The update was cancelled.");
        ctx.emitProgress({ key, phase });
        await wait(STEP_MS);
      }
    } finally {
      running.delete(key);
      cancelled.delete(key);
    }
  }

  /** Shared by update, reimport and relink: optional removal guard, then progress, then the row. */
  async function replace(
    skillId: string,
    approval: string | null | undefined,
    changes: Partial<Skill>,
  ): Promise<UpdateResult> {
    const skill = find(skillId);
    const guarded = skillId === GUARDED_SKILL || skillId === STALE_TOKEN_SKILL;
    if (guarded) {
      const round = approvalRounds.get(skillId) ?? 0;
      const expected = `mock-approval-${skillId}-${round}`;
      if (approval !== expected) {
        return {
          skill,
          contentChanged: true,
          pendingRemovals: removalsFor(skill, round),
          approval: expected,
        };
      }
      // The first approval of this skill arrives "too late": the list changed in the meantime.
      if (skillId === STALE_TOKEN_SKILL && round === 0) {
        approvalRounds.set(skillId, 1);
        return {
          skill,
          contentChanged: true,
          pendingRemovals: removalsFor(skill, 1),
          approval: `mock-approval-${skillId}-1`,
        };
      }
    }
    await phases(`${UPDATE_KEY_PREFIX}${skillId}`, ["cloning", "installing", "deploying"]);
    const contentChanged = skill.updateStatus === "update_available" || guarded || !isRemote(skill);
    const updated = patch(skillId, {
      ...changes,
      lastCheckedAt: Date.now(),
      lastCheckError: null,
      updatedAt: contentChanged ? Date.now() : skill.updatedAt,
    });
    return { skill: updated, contentChanged, pendingRemovals: [], approval: null };
  }

  function check(skillId: string): Skill {
    const skill = find(skillId);
    if (skillId === FAILING_CHECK_SKILL) {
      return patch(skillId, {
        updateStatus: "error",
        lastCheckedAt: Date.now(),
        lastCheckError: "Could not reach the source.",
      });
    }
    if (!isRemote(skill)) return patch(skillId, { lastCheckedAt: Date.now() });
    return patch(skillId, {
      lastCheckedAt: Date.now(),
      lastCheckError: null,
      updateStatus:
        skill.remoteRevision && skill.remoteRevision !== skill.sourceRevision
          ? "update_available"
          : "up_to_date",
    });
  }

  function requireSource(skill: Skill): void {
    if (skill.id === OFFLINE_SOURCE_SKILL)
      ctx.fail("IO", "The original source folder no longer exists.");
    if (!skill.sourceRef && !skill.sourceUrl)
      ctx.fail("UNSUPPORTED", "This skill has no source to compare with.");
  }

  function availableAgents(): AgentInfo[] {
    return ctx.getAgents().filter((agent) => agent.installed && agent.enabled);
  }

  /** Preset skills × available agents, minus the pairs switched off. */
  function wantedPairs(id: string): { skillId: string; agentKey: string }[] {
    return findPreset(id).skillIds.flatMap((skillId) =>
      availableAgents()
        .filter((agent) => !toggleOff.has(`${id}:${skillId}:${agent.key}`))
        .map((agent) => ({ skillId, agentKey: agent.key })),
    );
  }

  function isDeployed(skillId: string, agentKey: string): boolean {
    return ctx
      .getSkills()
      .some(
        (skill) => skill.id === skillId && skill.deployments.some((d) => d.agentKey === agentKey),
      );
  }

  return {
    "updates.check": async (skillId: string) => {
      await wait(STEP_MS);
      return check(skillId);
    },
    "updates.checkAll": async (): Promise<BatchResult> => {
      await wait(STEP_MS * 2);
      const remote = ctx
        .getSkills()
        .filter((skill) => isRemote(skill) || skill.id === FAILING_CHECK_SKILL);
      for (const skill of remote) check(skill.id);
      const failed = remote.filter((skill) => skill.id === FAILING_CHECK_SKILL);
      return {
        succeeded: remote.length - failed.length,
        failed: failed.map((skill) => ({
          name: skill.name,
          message: "Could not reach the source.",
        })),
      };
    },
    "updates.update": (skillId: string, approval?: string | null) =>
      replace(skillId, approval, {
        sourceRevision: NEW_REVISION,
        remoteRevision: NEW_REVISION,
        updateStatus: "up_to_date",
      }),
    "updates.reimport": (skillId: string, approval?: string | null) =>
      replace(skillId, approval, { updateStatus: "local_only" }),
    "updates.relink": (skillId: string, sourcePath: string, approval?: string | null) =>
      replace(skillId, approval, { sourceRef: sourcePath, updateStatus: "local_only" }),
    "updates.updateMany": async (skillIds: string[]): Promise<BatchUpdateResult> => {
      await wait(STEP_MS * 2);
      const result: BatchUpdateResult = { updated: 0, unchanged: 0, heldBack: [], failed: [] };
      for (const skillId of skillIds) {
        const skill = find(skillId);
        if (skillId === GUARDED_SKILL || skillId === STALE_TOKEN_SKILL) {
          result.heldBack.push(skill.name);
        } else if (skill.updateStatus === "update_available") {
          patch(skillId, { sourceRevision: NEW_REVISION, updateStatus: "up_to_date" });
          result.updated += 1;
        } else result.unchanged += 1;
      }
      return result;
    },
    "updates.detach": (skillId: string) =>
      patch(skillId, {
        sourceType: "local",
        sourceRef: null,
        sourceUrl: null,
        sourceBranch: null,
        sourceSubpath: null,
        sourceRevision: null,
        remoteRevision: null,
        updateStatus: "local_only",
      }),
    "updates.sourceDocument": async (skillId: string): Promise<SourceDocument> => {
      await wait(STEP_MS);
      const skill = find(skillId);
      requireSource(skill);
      return {
        filename: "SKILL.md",
        content: sampleDocument(skill.name, "4. Write down what changed.\n"),
        sourceLabel: isRemote(skill) ? "Git" : "Local",
        revision: isRemote(skill) ? NEW_REVISION : "workspace",
      };
    },
    "updates.sourceDiff": async (skillId: string): Promise<SourceDiff> => {
      await wait(STEP_MS * 2);
      const skill = find(skillId);
      requireSource(skill);
      const entry = { executableBefore: false, executableAfter: false } as const;
      return {
        skillId,
        sourceLabel: isRemote(skill) ? "Git" : "Local",
        revision: isRemote(skill) ? NEW_REVISION : "workspace",
        entries: [
          {
            ...entry,
            path: "SKILL.md",
            status: "modified",
            kind: "text",
            before: sampleDocument(skill.name, ""),
            after: sampleDocument(skill.name, "4. Write down what changed.\n"),
          },
          {
            ...entry,
            path: "references/checklist.md",
            status: "added",
            kind: "text",
            before: null,
            after: "# Checklist\n\n- [ ] Tests pass\n- [ ] Docs updated\n",
          },
          {
            ...entry,
            path: "scripts/legacy-check.sh",
            status: "removed",
            kind: "text",
            before: "#!/bin/sh\necho checking\n",
            after: null,
            executableBefore: true,
          },
          {
            ...entry,
            path: "assets/cover.png",
            status: "modified",
            kind: "binary",
            before: null,
            after: null,
          },
        ],
      };
    },
    "install.cancel": (key: string) => {
      if (!key.startsWith(UPDATE_KEY_PREFIX)) return ctx.cancelElsewhere(key);
      if (!running.has(key)) return false;
      cancelled.add(key);
      return true;
    },

    "presets.addSkills": (id: string, skillIds: string[]) => {
      const current = findPreset(id).skillIds;
      patchPreset(id, [...current, ...skillIds.filter((skillId) => !current.includes(skillId))]);
    },
    "presets.removeSkills": (id: string, skillIds: string[]) =>
      patchPreset(
        id,
        findPreset(id).skillIds.filter((skillId) => !skillIds.includes(skillId)),
      ),
    "presets.reorderSkills": (id: string, skillIds: string[]) => patchPreset(id, skillIds),
    "presets.toggles": (id: string, skillId: string): PresetAgentToggle[] =>
      ctx.getAgents().map((agent) => ({
        agentKey: agent.key,
        displayName: agent.displayName,
        installed: agent.installed,
        globallyEnabled: agent.enabled,
        enabled:
          agent.installed && agent.enabled && !toggleOff.has(`${id}:${skillId}:${agent.key}`),
      })),
    "presets.setToggle": (id: string, skillId: string, agentKey: string, enabled: boolean) => {
      const key = `${id}:${skillId}:${agentKey}`;
      if (enabled) toggleOff.delete(key);
      else toggleOff.add(key);
    },
    "presets.applyToDefault": async (id: string): Promise<ApplyResult> => {
      await wait(STEP_MS);
      const result: ApplyResult = { added: 0, removed: 0, skipped: 0, conflicts: [], failed: [] };
      for (const { skillId, agentKey } of wantedPairs(id)) {
        if (skillId === FAILING_CHECK_SKILL) {
          const agent = ctx.getAgents().find((entry) => entry.key === agentKey);
          result.conflicts.push({
            path: `${agent?.skillsDir ?? HOME}/${skillId}`,
            reason: "not installed from the library",
          });
        } else if (ctx.setDeployed(skillId, agentKey, true)) result.added += 1;
        else result.skipped += 1;
      }
      ctx.emitChanged("skills");
      return result;
    },
    "presets.removeFromDefault": async (id: string): Promise<ApplyResult> => {
      await wait(STEP_MS);
      const result: ApplyResult = { added: 0, removed: 0, skipped: 0, conflicts: [], failed: [] };
      for (const { skillId, agentKey } of wantedPairs(id)) {
        if (ctx.setDeployed(skillId, agentKey, false)) result.removed += 1;
        else result.skipped += 1;
      }
      ctx.emitChanged("skills");
      return result;
    },
    "presets.deployStatus": (): PresetDeployStatus[] =>
      ctx.getPresets().map((preset) => {
        const wanted = wantedPairs(preset.id);
        return {
          presetId: preset.id,
          deployed: wanted.filter((pair) => isDeployed(pair.skillId, pair.agentKey)).length,
          total: wanted.length,
        };
      }),
  };
}
