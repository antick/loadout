import { describe, expect, it } from "vitest";
import { DAY_MS, type UsageReport, indexUsage, isUnusedSkill } from "../src";

const NOW = 1_000 * DAY_MS;
const OLD_SKILL = { id: "alpha", createdAt: NOW - 100 * DAY_MS };

function report(scannedAt: number | null): UsageReport {
  return { enabled: true, scannedAt, skills: [], logs: [] };
}

describe("isUnusedSkill", () => {
  it("calls nothing unused before the logs were read once", () => {
    expect(isUnusedSkill(OLD_SKILL, indexUsage(report(null)), NOW)).toBe(false);
    expect(isUnusedSkill(OLD_SKILL, indexUsage(undefined), NOW)).toBe(false);
  });

  it("calls an old skill that never ran unused once they were read", () => {
    expect(isUnusedSkill(OLD_SKILL, indexUsage(report(NOW)), NOW)).toBe(true);
  });
});
