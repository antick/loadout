import type { RepairReport } from "@loadout/shared";
import { plural } from "../output";
import { limitPositionals } from "./support";
import type { CommandContext, CommandResult, CommandSpec } from "./types";
import { exitCodeFor } from "../exit-codes";

/** Put back every recorded deployment that is missing or a broken link. */
async function repair({ core, args }: CommandContext): Promise<CommandResult> {
  limitPositionals(args, 0);
  const report: RepairReport = await core.api.system.repairDeployments();
  const lines = [
    `Checked ${plural(report.checked, "deployment")}: ${report.repaired.length} put back, ${report.failed.length} could not be.`,
  ];
  for (const entry of report.repaired) lines.push(`  put back: ${entry.skill} (${entry.agentKey})`);
  for (const entry of report.failed) {
    lines.push(`  failed: ${entry.skill} (${entry.agentKey}): ${entry.message}`);
  }
  if (report.skippedAgents > 0) {
    lines.push(
      `${plural(report.skippedAgents, "deployment")} of agents not installed or switched off left alone.`,
    );
  }
  return { value: report, text: lines.join("\n"), exitCode: exitCodeFor(report.failed.length > 0) };
}

export const repairCommand: CommandSpec = {
  name: "repair",
  summary: "Put back deployments that are missing or broken links",
  usage: "",
  flags: [],
  notes: [
    "Only what Loadout recorded is deployed again, the normal way: a folder it did not create is never replaced, and is listed as a failure instead.",
    "The desktop app does the same every time it starts. Exit 1 when something could not be put back.",
  ],
  run: repair,
};
