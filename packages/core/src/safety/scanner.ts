import { accessSync, constants } from "node:fs";
import { delimiter, join } from "node:path";
import {
  SAFETY_SEVERITIES,
  type SafetyFinding,
  type SafetyReport,
  type SafetySeverity,
  type SafetyVerdict,
} from "@loadout/shared";
import { exec } from "../util/exec";
import { isDirectory, statOrNull } from "../util/fs";

/**
 * Running NVIDIA SkillSpector: finding the program, and turning its JSON report into ours. It is
 * a separate program the user installs (`uv tool install …`), so everything here assumes it may
 * be missing, old, slow or broken, and never lets that stop the app.
 */

const PROGRAM = "skillspector";
const WINDOWS_SUFFIXES = [".exe", ".cmd", ".bat"];
/**
 * Where `uv`, `pipx` and Homebrew put programs. A desktop app started from the Dock or Finder
 * gets a bare `PATH`, so these are looked at too.
 */
const HOME_BIN_DIRS = [join(".local", "bin")];
const SYSTEM_BIN_DIRS = ["/opt/homebrew/bin", "/usr/local/bin"];
/** Static scans take a couple of seconds; the cap is for a skill that makes the scanner hang. */
const SCAN_TIMEOUT_MS = 120_000;
const VERSION_TIMEOUT_MS = 20_000;
/** Exit 0: clean; 1: findings or a high score. Both come with a report. 2 is a failed scan. */
const REPORT_EXIT_CODES: ReadonlySet<number> = new Set([0, 1]);
/** The scanner's own triage line: a score above this is not safe to install. */
export const SAFETY_RISK_THRESHOLD = 50;
const BLOCKING_SEVERITIES: ReadonlySet<string> = new Set(["HIGH", "CRITICAL"]);
const MAX_FINDINGS = 100;
const MAX_EXCERPT = 240;
const MAX_TEXT = 1_000;
const VERSION_PATTERN = /(\d+\.\d+\.\d+)/;

export interface ScannerProgram {
  path: string;
  version: string | null;
}

function isExecutableFile(path: string): boolean {
  const stat = statOrNull(path);
  if (!stat?.isFile()) return false;
  if (process.platform === "win32") return true;
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function programNames(): string[] {
  return process.platform === "win32"
    ? WINDOWS_SUFFIXES.map((suffix) => `${PROGRAM}${suffix}`)
    : [PROGRAM];
}

/** The scanner to run: the path set in Settings, else the first one found on this machine. */
export function findScanner(homeDir: string, configured: string): string | null {
  if (configured.trim()) return isExecutableFile(configured.trim()) ? configured.trim() : null;
  const dirs = [
    ...(process.env.PATH ?? "").split(delimiter).filter(Boolean),
    ...HOME_BIN_DIRS.map((dir) => join(homeDir, dir)),
    ...SYSTEM_BIN_DIRS,
  ];
  for (const dir of new Set(dirs)) {
    if (!isDirectory(dir)) continue;
    for (const name of programNames()) {
      const path = join(dir, name);
      if (isExecutableFile(path)) return path;
    }
  }
  return null;
}

/** "SkillSpector v2.12.0" → "2.12.0"; null when it does not answer. */
export async function scannerVersion(path: string): Promise<string | null> {
  try {
    const result = await exec(path, ["--version"], { timeoutMs: VERSION_TIMEOUT_MS });
    return VERSION_PATTERN.exec(`${result.stdout}\n${result.stderr}`)?.[1] ?? null;
  } catch {
    return null;
  }
}

/** Run a static scan of one skill folder. Throws with the scanner's own words when it fails. */
export async function runScanner(path: string, skillDir: string): Promise<SafetyReport> {
  const result = await exec(path, ["scan", skillDir, "--format", "json", "--no-llm"], {
    timeoutMs: SCAN_TIMEOUT_MS,
    // Plain text only: its messages end up in the app.
    env: { ...process.env, NO_COLOR: "1" },
  });
  if (!REPORT_EXIT_CODES.has(result.code)) {
    const reason = lastLine(result.stderr) ?? lastLine(result.stdout) ?? `exit code ${result.code}`;
    throw new Error(`SkillSpector could not scan the skill: ${reason}`);
  }
  return parseReport(result.stdout, Date.now());
}

function lastLine(text: string): string | null {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.at(-1) ?? null;
}

// ── Report ──

type Json = Record<string, unknown>;

const asObject = (value: unknown): Json =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {};
const asText = (value: unknown): string => (typeof value === "string" ? value : "");
const asNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

function shorten(text: string, max: number): string {
  const flat = text.trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

function severityOf(value: unknown): SafetySeverity | null {
  const upper = asText(value).toUpperCase();
  return SAFETY_SEVERITIES.find((severity) => severity === upper) ?? null;
}

function findingOf(raw: unknown): SafetyFinding | null {
  const issue = asObject(raw);
  const severity = severityOf(issue.severity);
  if (!severity) return null;
  const location = asObject(issue.location);
  const line = asNumber(location.start_line);
  return {
    id: asText(issue.id),
    category: asText(issue.category),
    pattern: asText(issue.pattern),
    severity,
    confidence: asNumber(issue.confidence) ?? 0,
    file: asText(location.file),
    line: line !== null && line > 0 ? line : null,
    excerpt: shorten(asText(issue.finding), MAX_EXCERPT),
    explanation: shorten(asText(issue.explanation), MAX_TEXT),
    remediation: shorten(asText(issue.remediation), MAX_TEXT),
  };
}

const SEVERITY_RANK: Record<SafetySeverity, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

/** The scanner's own rule: over the score threshold, or any high or critical finding. */
function verdictOf(score: number, worst: string, findings: number): SafetyVerdict {
  if (score > SAFETY_RISK_THRESHOLD || BLOCKING_SEVERITIES.has(worst.toUpperCase())) {
    return "unsafe";
  }
  return findings > 0 ? "caution" : "safe";
}

/** Our report from the scanner's JSON. It may print text before the JSON, so that is skipped. */
export function parseReport(stdout: string, scannedAt: number): SafetyReport {
  const start = stdout.indexOf("{");
  let data: Json;
  try {
    data = asObject(JSON.parse(start >= 0 ? stdout.slice(start) : stdout));
  } catch {
    throw new Error("SkillSpector's report could not be read.");
  }
  const risk = asObject(data.risk_assessment);
  const score = asNumber(risk.score);
  if (score === null) throw new Error("SkillSpector's report has no risk score.");

  const all = (Array.isArray(data.issues) ? data.issues : []).flatMap((raw) => {
    const finding = findingOf(raw);
    return finding ? [finding] : [];
  });
  const counts: Record<SafetySeverity, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const finding of all) counts[finding.severity] += 1;
  const findings = [...all]
    .sort(
      (a, b) =>
        SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.confidence - a.confidence,
    )
    .slice(0, MAX_FINDINGS);
  const metadata = asObject(data.metadata);

  return {
    verdict: verdictOf(score, asText(risk.max_issue_severity), all.length),
    score,
    recommendation: asText(risk.recommendation),
    counts,
    findings,
    scannerVersion: asText(metadata.skillspector_version) || null,
    scannedAt,
  };
}
