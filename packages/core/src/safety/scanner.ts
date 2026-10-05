import { accessSync, constants } from "node:fs";
import { delimiter, join } from "node:path";
import {
  MINUTE_MS,
  SAFETY_SEVERITIES,
  SECOND_MS,
  SYSTEM_BIN_DIRS,
  type SafetyFinding,
  type SafetyReport,
  type SafetySeverity,
  isRecord,
} from "@loadout/shared";
import { AppError, invalid, unsupported } from "../errors";
import { exec } from "../util/exec";
import { isDirectory, statOrNull } from "../util/fs";
import { buildReport, isBlockingSeverity, shorten } from "./report";

/**
 * Running NVIDIA SkillSpector: finding the program, and turning its JSON report into ours. It is
 * a separate program the user installs (`uv tool install …`), so everything here assumes it may
 * be missing, old, slow or broken, and never lets that stop the app.
 */

const PROGRAM = "skillspector";
const WINDOWS_SUFFIXES = [".exe"];
/** Windows scripts Node starts only through a shell, which Loadout never uses. */
const SHELL_ONLY_SUFFIXES = [".cmd", ".bat"];
/** Where `uv` and `pipx` put programs, looked in besides `SYSTEM_BIN_DIRS`. */
const HOME_BIN_DIRS = [join(".local", "bin")];
/** Static scans take a couple of seconds; the cap is for a skill that makes the scanner hang. */
const SCAN_TIMEOUT_MS = 2 * MINUTE_MS;
const VERSION_TIMEOUT_MS = 20 * SECOND_MS;
/** Exit 0: clean; 1: findings or a high score. Both come with a report. 2 is a failed scan. */
const REPORT_EXIT_CODES: ReadonlySet<number> = new Set([0, 1]);
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

/** Refuses a scanner set in Settings that only a shell can start. */
function requireStartable(path: string): void {
  const lower = path.toLowerCase();
  if (!SHELL_ONLY_SUFFIXES.some((suffix) => lower.endsWith(suffix))) return;
  throw unsupported(
    `SkillSpector at ${path} is a Windows script that needs a shell to start, and Loadout runs programs without one. Set the path to skillspector.exe instead.`,
  );
}

/** Run a static scan of one skill folder. Throws with the scanner's own words when it fails. */
export async function runScanner(path: string, skillDir: string): Promise<SafetyReport> {
  requireStartable(path);
  const result = await exec(path, ["scan", skillDir, "--format", "json", "--no-llm"], {
    timeoutMs: SCAN_TIMEOUT_MS,
    // Plain text only: its messages end up in the app.
    env: { ...process.env, NO_COLOR: "1" },
  });
  if (!REPORT_EXIT_CODES.has(result.code)) {
    const reason = lastLine(result.stderr) ?? lastLine(result.stdout) ?? `exit code ${result.code}`;
    throw new AppError("IO", `SkillSpector could not scan the skill: ${reason}`);
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

const asObject = (value: unknown): Json => (isRecord(value) ? value : {});
const asText = (value: unknown): string => (typeof value === "string" ? value : "");
const asNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

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
    excerpt: shorten(asText(issue.finding)),
    explanation: shorten(asText(issue.explanation), MAX_TEXT),
    remediation: shorten(asText(issue.remediation), MAX_TEXT),
  };
}

/** Our report from the scanner's JSON. It may print text before the JSON, so that is skipped. */
export function parseReport(stdout: string, scannedAt: number): SafetyReport {
  const start = stdout.indexOf("{");
  let data: Json;
  try {
    data = asObject(JSON.parse(start >= 0 ? stdout.slice(start) : stdout));
  } catch {
    throw invalid("SkillSpector's report could not be read.");
  }
  const risk = asObject(data.risk_assessment);
  const score = asNumber(risk.score);
  if (score === null) throw invalid("SkillSpector's report has no risk score.");

  const findings = (Array.isArray(data.issues) ? data.issues : []).flatMap((raw) => {
    const finding = findingOf(raw);
    return finding ? [finding] : [];
  });
  return buildReport({
    engine: "skillspector",
    findings,
    score,
    // The scanner's own rule: any high or critical finding, whatever its confidence.
    blocking: isBlockingSeverity(asText(risk.max_issue_severity)),
    recommendation: asText(risk.recommendation),
    scannerVersion: asText(asObject(data.metadata).skillspector_version) || null,
    scannedAt,
  });
}
