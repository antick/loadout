import type {
  CoreApi,
  HealthArea,
  HealthFinding,
  HealthReport,
  HealthSeverity,
  LibraryWarning,
  LocalSkill,
  Skill,
  SyncStatus,
} from "@loadout/shared";
import { errorMessage } from "../errors";
import { lstatOrNull } from "../util/fs";

const LIBRARY_WARNINGS: Record<LibraryWarning, string> = {
  config_unreadable: "The location file could not be read, so the default folder is in use.",
  library_path_invalid: "The chosen folder cannot be used, so the default folder is in use.",
  migration_incomplete: "Moving the library did not finish.",
};

/** Managed copies that no longer match the library, and why. */
const COPY_DRIFT: Partial<Record<SyncStatus, string>> = {
  local_newer: "The copy was changed in the agent's folder; the library does not have the change.",
  diverged: "The copy and the library were both changed since the copy was made.",
  library_newer: "The copy is older than the library.",
};

type Finding = HealthFinding;

function formatFindings(skills: readonly Skill[]): Finding[] {
  return skills.flatMap((skill) =>
    skill.issues.map((issue) => ({
      area: "format" as const,
      severity: issue.severity,
      message: issue.line === undefined ? issue.message : `${issue.message} (line ${issue.line})`,
      skill: skill.name,
      path: skill.libraryPath,
    })),
  );
}

function deploymentFindings(skills: readonly Skill[]): Finding[] {
  return skills.flatMap((skill) =>
    skill.deployments
      .filter((deployment) => lstatOrNull(deployment.targetPath) === null)
      .map((deployment) => ({
        area: "deployments" as const,
        severity: "error" as const,
        message: "Deployed, but not on disk. Deploy it again to put it back.",
        skill: skill.name,
        agent: deployment.agentKey,
        path: deployment.targetPath,
      })),
  );
}

function updateFindings(skills: readonly Skill[]): Finding[] {
  return skills.flatMap((skill): Finding[] => {
    const base = { area: "updates" as const, skill: skill.name };
    if (skill.updateStatus === "error") {
      return [{ ...base, severity: "warning", message: "The last update check failed." }];
    }
    if (skill.updateStatus === "source_missing") {
      return [{ ...base, severity: "warning", message: "Its source is gone; it cannot update." }];
    }
    if (skill.updateStatus === "update_available") {
      return [{ ...base, severity: "info", message: "A newer version is available." }];
    }
    return [];
  });
}

function backupFindings(skills: readonly Skill[]): Finding[] {
  return skills
    .filter((skill) => skill.hasConflict)
    .map((skill) => ({
      area: "backup" as const,
      severity: "error" as const,
      message: "A backup conflict is waiting to be resolved.",
      skill: skill.name,
    }));
}

function localFindings(skill: LocalSkill, agentKey: string): Finding[] {
  const base = {
    area: "agent_folders" as const,
    skill: skill.name,
    agent: agentKey,
    path: skill.path,
  };
  const found: Finding[] = [];
  if (!skill.managed && skill.librarySkillId === null) {
    found.push({ ...base, severity: "info", message: "Not in the library." });
  }
  const drift = skill.managed ? COPY_DRIFT[skill.syncStatus] : undefined;
  if (drift) found.push({ ...base, severity: "warning", message: drift });
  if (skill.enabled) {
    for (const other of skill.duplicates) {
      found.push({ ...base, severity: "warning", message: `Loaded twice: also at ${other.path}.` });
    }
  }
  return found;
}

async function agentFolderFindings(api: CoreApi): Promise<{ findings: Finding[]; agents: number }> {
  const agents = (await api.agents.list()).filter((agent) => agent.installed && agent.enabled);
  const findings: Finding[] = [];
  for (const agent of agents) {
    for (const skill of await api.workspace.list(agent.key)) {
      findings.push(...localFindings(skill, agent.key));
    }
    for (const broken of await api.workspace.broken(agent.key)) {
      findings.push({
        area: "agent_folders",
        severity: "warning",
        message:
          broken.reason === "dangling_link"
            ? "A link to a folder that no longer exists; the agent ignores it."
            : "No SKILL.md inside; the agent ignores it.",
        skill: broken.dirName,
        agent: agent.key,
        path: broken.path,
      });
    }
  }
  return { findings, agents: agents.length };
}

/**
 * Agents that share a folder see the same entries: one finding per path and message, naming
 * every agent that reported it.
 */
function mergeShared(findings: readonly Finding[]): Finding[] {
  const merged = new Map<string, Finding>();
  for (const finding of findings) {
    const key = `${finding.area}\n${finding.message}\n${finding.path ?? finding.skill ?? ""}`;
    const earlier = merged.get(key);
    if (!earlier) merged.set(key, { ...finding });
    else if (finding.agent && earlier.agent && !earlier.agent.split(", ").includes(finding.agent)) {
      earlier.agent = `${earlier.agent}, ${finding.agent}`;
    }
  }
  return [...merged.values()];
}

/** A part that could not be checked is itself a finding; the report is never lost to one error. */
async function guarded<T>(
  area: HealthArea,
  run: () => Promise<T>,
  fallback: T,
  failures: Finding[],
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    failures.push({
      area,
      severity: "warning",
      message: `Could not be checked: ${errorMessage(error)}`,
    });
    return fallback;
  }
}

/** Look over the library, the agents' folders, updates, backup, safety and projects. */
export async function checkHealth(api: CoreApi): Promise<HealthReport> {
  const failures: Finding[] = [];
  const location = await guarded("library", () => api.system.libraryLocation(), null, failures);
  const skills = await guarded("format", () => api.skills.list(), [], failures);
  const folders = await guarded(
    "agent_folders",
    () => agentFolderFindings(api),
    { findings: [], agents: 0 },
    failures,
  );
  const safety = await guarded("safety", () => api.safety.list(), [], failures);
  const projects = await guarded("projects", () => api.projects.list(), [], failures);
  const nameOf = new Map(skills.map((skill) => [skill.id, skill.name]));

  const findings = mergeShared([
    ...(location?.warnings ?? []).map((warning): Finding => ({
      area: "library",
      severity: "warning",
      message: LIBRARY_WARNINGS[warning],
      path: location?.path,
    })),
    ...formatFindings(skills),
    ...deploymentFindings(skills),
    ...folders.findings,
    ...updateFindings(skills),
    ...backupFindings(skills),
    ...safety
      .filter((record) => record.verdict !== "safe")
      .map((record): Finding => ({
        area: "safety",
        severity: record.verdict === "unsafe" ? "error" : "warning",
        message: `${record.verdict === "unsafe" ? "Flagged" : "Worth a look"}: risk ${record.score}/100${
          record.stale ? ", checked before its last change" : ""
        }.`,
        skill: nameOf.get(record.skillId) ?? record.skillId,
      })),
    ...projects
      .filter((project) => project.missing)
      .map((project): Finding => ({
        area: "projects",
        severity: "warning",
        message: "The project folder is gone.",
        path: project.path,
      })),
    ...failures,
  ]);

  const counts: Record<HealthSeverity, number> = { error: 0, warning: 0, info: 0 };
  for (const finding of findings) counts[finding.severity] += 1;
  return {
    findings,
    counts,
    checked: { skills: skills.length, agents: folders.agents, projects: projects.length },
  };
}
