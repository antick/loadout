/**
 * Safety checks of skills with NVIDIA SkillSpector (github.com/NVIDIA/SkillSpector), an optional
 * scanner the user installs. It runs static checks only (`--no-llm`: no model calls, no keys).
 * Without it every check is skipped and the app works as before.
 */

/**
 * `unsafe`: the scanner says not to install (a risk score over its threshold, or a high or
 * critical finding). `caution`: it found something worth reading. `safe`: nothing found.
 */
export type SafetyVerdict = "safe" | "caution" | "unsafe";

export const SAFETY_SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;
export type SafetySeverity = (typeof SAFETY_SEVERITIES)[number];

export interface SafetyFinding {
  /** Rule id, e.g. `P1`. */
  id: string;
  /** e.g. "Prompt Injection". */
  category: string;
  /** e.g. "Instruction Override". */
  pattern: string;
  severity: SafetySeverity;
  /** 0–1. */
  confidence: number;
  /** File inside the skill, `/` separated. */
  file: string;
  /** 1-based; null when the finding is about the whole file. */
  line: number | null;
  /** The text that matched, shortened. */
  excerpt: string;
  explanation: string;
  remediation: string;
}

export interface SafetyReport {
  verdict: SafetyVerdict;
  /** 0–100, higher is riskier. */
  score: number;
  /** As the scanner words it: SAFE, CAUTION, DO_NOT_INSTALL. */
  recommendation: string;
  /** Findings by severity. */
  counts: Record<SafetySeverity, number>;
  /** Worst first, capped; `counts` has the full numbers. */
  findings: SafetyFinding[];
  scannerVersion: string | null;
  /** Epoch ms. */
  scannedAt: number;
}

/** The last report of a library skill. */
export interface SafetyRecord extends SafetyReport {
  skillId: string;
  /** The skill's content hash when it was scanned. */
  contentHash: string;
  /** The skill changed since: the report may no longer hold. */
  stale: boolean;
}

export interface SafetyStatus {
  /** The scanner was found and answers. */
  available: boolean;
  /** The program that runs; null when none was found. */
  path: string | null;
  version: string | null;
  /** Check every install before it is written (the `safetyScanOnInstall` setting). */
  scanOnInstall: boolean;
}

/** A skill an install stopped for, with the report that stopped it. */
export interface FlaggedSkill {
  name: string;
  report: SafetyReport;
}

export interface SafetyScanSummary {
  scanned: number;
  unsafe: number;
  caution: number;
  failed: { name: string; message: string }[];
}

/** Options every single-skill install takes. */
export interface InstallOptions {
  /** The user read the safety report of a flagged skill and installs it anyway. */
  acceptRisk?: boolean;
}

/** Progress key of "scan the whole library", reported through `install:progress`. */
export const SAFETY_SCAN_LIBRARY_KEY = "safety:library";

/** The command that installs the scanner, shown where it is missing. */
export const SAFETY_SCANNER_INSTALL_COMMAND =
  "uv tool install git+https://github.com/NVIDIA/skillspector.git";
export const SAFETY_SCANNER_URL = "https://github.com/NVIDIA/SkillSpector";
