/**
 * One report of everything in the setup that needs a look: the library's own checks, where skills
 * are deployed, what sits in agent folders, updates, backup, safety and projects. `loadout doctor`
 * prints it; errors make it exit with code 1.
 */

export const HEALTH_AREAS = [
  "library",
  "format",
  "deployments",
  "agent_folders",
  "updates",
  "backup",
  "safety",
  "projects",
] as const;
export type HealthArea = (typeof HEALTH_AREAS)[number];

/** `error`: something is broken or unsafe. `warning`: worth fixing. `info`: good to know. */
export type HealthSeverity = "error" | "warning" | "info";

export interface HealthFinding {
  area: HealthArea;
  severity: HealthSeverity;
  message: string;
  /** Library skill name, or the folder name for skills outside the library. */
  skill?: string;
  agent?: string;
  path?: string;
}

export interface HealthReport {
  findings: HealthFinding[];
  counts: Record<HealthSeverity, number>;
  checked: { skills: number; agents: number; projects: number };
}
