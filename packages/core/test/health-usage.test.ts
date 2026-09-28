import { type SkillUsage, USAGE_RECENT_MS, type UsageReport } from "@loadout/shared";
import { describe, expect, it } from "vitest";
import { usageFindings } from "../src/health/usage";
import { skillRecord } from "./skill-records";

const NOW = Date.UTC(2026, 8, 28);
const OLD = NOW - USAGE_RECENT_MS * 2;

function report(extra: Partial<UsageReport>): UsageReport {
  return { enabled: true, scannedAt: NOW, skills: [], logs: [], ...extra };
}

/** A skill run once, last at `lastUsedAt`. */
function used(skillId: string, lastUsedAt: number): SkillUsage {
  return { skillId, uses: 1, recentUses: 0, lastUsedAt, byAgent: {}, projects: [] };
}

describe("doctor: skill use", () => {
  const skills = [
    skillRecord("busy", { createdAt: OLD }),
    skillRecord("stale", { createdAt: OLD }),
    skillRecord("never", { createdAt: OLD }),
    skillRecord("new", { createdAt: NOW - 1000 }),
  ];

  it("names skills not run lately, leaving out new ones", () => {
    const findings = usageFindings(
      skills,
      report({ skills: [used("busy", NOW - 1000), used("stale", OLD)] }),
      NOW,
    );
    expect(findings.map((finding) => [finding.skill, finding.severity, finding.message])).toEqual([
      ["stale", "info", "Not run in the last 30 days."],
      ["never", "info", "Never run by an agent Loadout reads the logs of."],
    ]);
  });

  it("says nothing until tracking is on and has read the logs", () => {
    expect(usageFindings(skills, report({ enabled: false }), NOW)).toEqual([]);
    expect(usageFindings(skills, report({ scannedAt: null }), NOW)).toEqual([]);
    expect(usageFindings(skills, null, NOW)).toEqual([]);
  });
});
