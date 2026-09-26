import { checkHealth } from "@loadout/core";
import { HEALTH_AREAS, type HealthArea, type HealthFinding } from "@loadout/shared";
import { flagBoolean } from "../args";
import { plural } from "../output";
import { limitPositionals } from "./support";
import type { CommandContext, CommandGroup, CommandResult } from "./types";

const ALL_FLAG = {
  name: "all",
  type: "boolean",
  description: "Also list findings that are only good to know (info), such as available updates.",
} as const;

const AREA_TITLES: Record<HealthArea, string> = {
  library: "Library",
  format: "Skill format",
  deployments: "Deployments",
  agent_folders: "Agent folders",
  updates: "Updates",
  backup: "Backup",
  safety: "Safety check",
  projects: "Projects",
};

function describe(finding: HealthFinding): string {
  const who = [finding.skill, finding.agent ? `(${finding.agent})` : null]
    .filter(Boolean)
    .join(" ");
  const where = finding.path ? `\n      ${finding.path}` : "";
  return `  ${finding.severity}: ${who ? `${who}: ` : ""}${finding.message}${where}`;
}

/** Everything that needs a look, grouped by area. Exit code 1 when anything is an error. */
async function doctor({ core, args }: CommandContext): Promise<CommandResult> {
  limitPositionals(args, 0);
  const report = await checkHealth(core.api);
  const all = flagBoolean(args, ALL_FLAG.name);
  const shown = report.findings.filter((finding) => all || finding.severity !== "info");

  const lines: string[] = [];
  for (const area of HEALTH_AREAS) {
    const here = shown.filter((finding) => finding.area === area);
    if (here.length === 0) continue;
    lines.push(`${AREA_TITLES[area]}:`, ...here.map(describe), "");
  }
  const { error, warning, info } = report.counts;
  const { skills, agents, projects } = report.checked;
  lines.push(
    `Checked ${plural(skills, "skill")}, ${plural(agents, "agent")} and ${plural(projects, "project")}: ${plural(error, "error")}, ${plural(warning, "warning")}, ${info} to know.`,
  );
  if (error + warning === 0) lines.push("Everything looks healthy.");
  if (!all && info > 0) lines.push("Run with --all to list the rest.");
  return { value: report, text: lines.join("\n"), exitCode: error > 0 ? 1 : 0 };
}

export const doctorGroup: CommandGroup = {
  name: "doctor",
  summary: "Check the library, agent folders, updates, backup and safety in one report",
  commands: [],
  standalone: {
    name: "doctor",
    summary: "Check the library, agent folders, updates, backup and safety in one report",
    usage: "[--all]",
    flags: [ALL_FLAG],
    notes: [
      "Exit code 1 when anything is an error (a broken skill, a deployment missing on disk, a backup conflict, a skill the safety check flagged). Warnings and info do not fail it.",
    ],
    run: doctor,
  },
};
