import { readFileSync } from "node:fs";
import type { SafetyFinding, SafetyReport, SafetySeverity, SafetyVerdict } from "@loadout/shared";
import { listContentFiles } from "../util/hash";
import { BUILTIN_RULES_VERSION, CATEGORY_LABELS, SAFETY_RULES, type SafetyRule } from "./rules";
import { SAFETY_RISK_THRESHOLD } from "./scanner";

/** Files bigger than this are not read: a skill's text never is, a payload might be. */
const MAX_FILE_BYTES = 1024 * 1024;
/** Lines longer than this are minified or generated, not instructions; one look is enough. */
const MAX_LINE_LENGTH = 4000;
const MAX_FINDINGS = 100;
const MAX_EXCERPT = 240;
/** Names whose content is never text worth reading. */
const SKIPPED_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".svg",
  ".ico",
  ".pdf",
  ".zip",
  ".gz",
  ".tar",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".mp3",
  ".mp4",
  ".wav",
  ".lock",
]);
const DOCUMENT_EXTENSIONS = new Set([".md", ".mdx", ".markdown", ".txt", ".rst", ""]);
const FENCE_PATTERN = /^\s*(`{3,}|~{3,})/;
const COMMENT_PATTERN = /^\s*(?:#(?!!)|\/\/|\/\*|\*|--\s|<!--|;)/;

/** A hit in a comment is talked about, not run; one in a document's prose may be a warning. */
const COMMENT_FACTOR = 0.5;
const PROSE_FACTOR = 0.6;
/** Weight of one finding at full confidence, summed into the 0–100 score. */
const SEVERITY_WEIGHT: Record<SafetySeverity, number> = {
  CRITICAL: 45,
  HIGH: 30,
  MEDIUM: 12,
  LOW: 4,
};
const SEVERITY_RANK: Record<SafetySeverity, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
/** A high or critical hit stops an install only when the context left it this sure. */
const BLOCKING_CONFIDENCE = 0.6;
const BLOCKING_SEVERITIES: ReadonlySet<SafetySeverity> = new Set(["CRITICAL", "HIGH"]);

type LineContext = "code" | "comment" | "prose";

function extensionOf(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? "" : name.slice(dot).toLowerCase();
}

function shorten(text: string): string {
  const flat = text.trim();
  return flat.length > MAX_EXCERPT ? `${flat.slice(0, MAX_EXCERPT - 1)}…` : flat;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Each line with where it sits: code, a comment, or a document's prose (outside fences). */
function* contextualLines(
  text: string,
  document: boolean,
): Generator<[number, string, LineContext]> {
  let fence: string | null = null;
  for (const [index, raw] of text.split(/\r?\n/).entries()) {
    const line = raw.length > MAX_LINE_LENGTH ? raw.slice(0, MAX_LINE_LENGTH) : raw;
    if (document) {
      const marker = FENCE_PATTERN.exec(line)?.[1];
      if (marker) {
        if (fence === null) fence = marker.charAt(0);
        else if (marker.charAt(0) === fence) fence = null;
        continue;
      }
      yield [index + 1, line, fence === null ? "prose" : "code"];
    } else {
      yield [index + 1, line, COMMENT_PATTERN.test(line) ? "comment" : "code"];
    }
  }
}

function factorFor(rule: SafetyRule, context: LineContext): number {
  if (context === "comment") return COMMENT_FACTOR;
  // Prose is what the agent is told: injection rules count in full there, commands less.
  if (context === "prose") return rule.category === "injection" ? 1 : PROSE_FACTOR;
  return 1;
}

function scanText(file: string, text: string, document: boolean): SafetyFinding[] {
  const findings: SafetyFinding[] = [];
  const seen = new Set<string>();
  for (const [line, content, context] of contextualLines(text, document)) {
    if (!content.trim()) continue;
    for (const rule of SAFETY_RULES) {
      if (rule.documentsOnly && !document) continue;
      if (!rule.regex.test(content) || rule.skip?.(content)) continue;
      const key = `${rule.id}\0${line}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const secret = rule.id.startsWith("credentials.hardcoded");
      findings.push({
        id: rule.id,
        category: CATEGORY_LABELS[rule.category],
        pattern: rule.pattern,
        severity: rule.severity,
        confidence: round(rule.confidence * factorFor(rule, context)),
        file,
        line,
        // The key itself must not travel with the report.
        excerpt: secret ? "" : shorten(content),
        explanation: rule.explanation,
        remediation: rule.remediation,
      });
    }
  }
  return findings;
}

function verdictOf(score: number, findings: readonly SafetyFinding[]): SafetyVerdict {
  const blocking = findings.some(
    (finding) =>
      BLOCKING_SEVERITIES.has(finding.severity) && finding.confidence >= BLOCKING_CONFIDENCE,
  );
  if (score > SAFETY_RISK_THRESHOLD || blocking) return "unsafe";
  return findings.length > 0 ? "caution" : "safe";
}

const RECOMMENDATIONS: Record<SafetyVerdict, string> = {
  safe: "SAFE",
  caution: "CAUTION",
  unsafe: "DO_NOT_INSTALL",
};

/** The rules over every text file of a skill folder, as one report. Reads, never writes. */
export function scanWithRules(dir: string, scannedAt = Date.now()): SafetyReport {
  const all: SafetyFinding[] = [];
  for (const file of listContentFiles(dir)) {
    const extension = extensionOf(file.relativePath);
    if (file.size > MAX_FILE_BYTES || SKIPPED_EXTENSIONS.has(extension)) continue;
    let bytes: Buffer;
    try {
      bytes = readFileSync(file.absolutePath);
    } catch {
      continue;
    }
    if (bytes.includes(0)) continue;
    all.push(
      ...scanText(file.relativePath, bytes.toString("utf8"), DOCUMENT_EXTENSIONS.has(extension)),
    );
  }
  const counts: Record<SafetySeverity, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  let weight = 0;
  for (const finding of all) {
    counts[finding.severity] += 1;
    weight += SEVERITY_WEIGHT[finding.severity] * finding.confidence;
  }
  const score = Math.min(100, Math.round(weight));
  const findings = [...all]
    .sort(
      (a, b) =>
        SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.confidence - a.confidence,
    )
    .slice(0, MAX_FINDINGS);
  const verdict = verdictOf(score, all);
  return {
    engine: "builtin",
    verdict,
    score,
    recommendation: RECOMMENDATIONS[verdict],
    counts,
    findings,
    scannerVersion: BUILTIN_RULES_VERSION,
    scannedAt,
  };
}
