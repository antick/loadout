import type { SafetyFinding, SafetyReport, SafetySeverity, SafetyVerdict } from "@loadout/shared";

/** SkillSpector's own triage line, kept by the built-in rules too: a score above this is unsafe. */
export const SAFETY_RISK_THRESHOLD = 50;
export const MAX_EXCERPT = 240;
const MAX_FINDINGS = 100;
const SEVERITY_RANK: Record<SafetySeverity, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
const BLOCKING_SEVERITIES: ReadonlySet<string> = new Set(["CRITICAL", "HIGH"]);
const RECOMMENDATIONS: Record<SafetyVerdict, string> = {
  safe: "SAFE",
  caution: "CAUTION",
  unsafe: "DO_NOT_INSTALL",
};

export const isBlockingSeverity = (severity: string): boolean =>
  BLOCKING_SEVERITIES.has(severity.toUpperCase());

export function shorten(text: string, max = MAX_EXCERPT): string {
  const flat = text.trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

export interface ReportParts {
  engine: SafetyReport["engine"];
  findings: readonly SafetyFinding[];
  score: number;
  /** Something found stops an install whatever the score. */
  blocking: boolean;
  /** The engine's own words; the verdict's when it has none. */
  recommendation?: string;
  scannerVersion: string | null;
  scannedAt: number;
}

/** One report from either engine: counts of every finding, the worst ones first, the verdict. */
export function buildReport(parts: ReportParts): SafetyReport {
  const counts: Record<SafetySeverity, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const finding of parts.findings) counts[finding.severity] += 1;
  const verdict: SafetyVerdict =
    parts.score > SAFETY_RISK_THRESHOLD || parts.blocking
      ? "unsafe"
      : parts.findings.length > 0
        ? "caution"
        : "safe";
  const findings = [...parts.findings]
    .sort(
      (a, b) =>
        SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.confidence - a.confidence,
    )
    .slice(0, MAX_FINDINGS);
  return {
    engine: parts.engine,
    verdict,
    score: parts.score,
    recommendation: parts.recommendation ?? RECOMMENDATIONS[verdict],
    counts,
    findings,
    scannerVersion: parts.scannerVersion,
    scannedAt: parts.scannedAt,
  };
}
