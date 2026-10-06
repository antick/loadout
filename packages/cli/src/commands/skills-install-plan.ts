import type { InstallPlan, SafetyReport, SkillTraitCode } from "@loadout/shared";
import { outcomeLabel } from "../install-outcome";
import { plural, table } from "../output";

export type { InstallPlan } from "@loadout/shared";

const NEW_LABEL = "new";

/** What a trait is called in the `can run` column. */
const TRAIT_LABELS: Record<SkillTraitCode, string> = {
  scripts: "scripts",
  hooks: "hooks",
  mcp: "MCP servers",
  tool_grants: "pre-approved tools",
};

/** One line about what the safety check found, when it found anything. */
export function safetySummary(name: string, report: SafetyReport | null): string | undefined {
  if (!report || report.verdict === "safe") return undefined;
  const found = report.findings.length;
  return `Safety check on ${name}: ${report.recommendation}, risk ${report.score}/100, ${plural(found, "finding")}. Run with --json to read them.`;
}

/** The plan as a person reads it. */
export function planText(plan: InstallPlan): string {
  const rows = plan.installed.map((row) => [
    row.name,
    plan.refreshesInPlace
      ? "already installed: refreshed in place"
      : outcomeLabel(row.outcome) || NEW_LABEL,
    row.manualOnly ? "manual only" : "",
    row.traits.map((trait) => TRAIT_LABELS[trait.code]).join(", "),
    row.relPath ?? "",
  ]);
  const lines = [
    `Dry run: nothing was installed. From ${plan.source}, ${plural(plan.installed.length, "skill")} would be added:`,
    table(["name", "outcome", "invocation", "can run", "folder"], rows, "  (none)"),
  ];
  if (plan.installed.some((row) => row.outcome.kind === "taken")) {
    lines.push(
      "A skill identical to the one holding its name is not added twice: the library keeps one.",
    );
  }
  if (plan.redirectedTo) lines.push(`The download moved to ${plan.redirectedTo}.`);
  for (const row of plan.installed) {
    const line = safetySummary(row.name, row.safety);
    if (line) lines.push(line);
  }
  lines.push("Fetched and safety-checked as the real install would be.");
  return lines.join("\n");
}
