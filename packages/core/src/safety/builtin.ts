import type { SafetyFinding, SafetyReport, SafetySeverity } from "@loadout/shared";
import { isNeverCopiedName } from "../util/fs";
import { type ContentFile, listContentFiles } from "../util/hash";
import { createLineSplitter, readTextChunks } from "../util/text-stream";
import {
  BUILTIN_RULES_VERSION,
  CATEGORY_LABELS,
  SAFETY_RULES,
  type SafetyRule,
  UNCHECKED_CATEGORY,
} from "./rules";
import { MAX_EXCERPT, buildReport, isBlockingSeverity, shorten } from "./report";

/**
 * A line longer than this is checked in pieces this long, each repeating the last
 * {@link PIECE_OVERLAP} characters of the one before: far longer than anything a rule matches.
 * It also bounds the text one rule's pattern runs over at once.
 */
const PIECE_CHARS = 4000;
const PIECE_OVERLAP = 1000;
/** Media nothing runs: not read, unless marked executable. */
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
/**
 * Files something runs or loads as code: scripts, compiled bytecode, native programs and
 * libraries. A stray NUL byte does not stop every interpreter, so their text is read anyway.
 */
const RUNNABLE_EXTENSIONS = new Set([
  ".sh",
  ".bash",
  ".zsh",
  ".fish",
  ".ps1",
  ".bat",
  ".cmd",
  ".py",
  ".pyc",
  ".pyo",
  ".js",
  ".mjs",
  ".cjs",
  ".ts",
  ".rb",
  ".pl",
  ".php",
  ".lua",
  ".jar",
  ".class",
  ".wasm",
  ".node",
  ".exe",
  ".dll",
  ".so",
  ".dylib",
]);
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
/** A high or critical hit stops an install only when the context left it this sure. */
const BLOCKING_CONFIDENCE = 0.6;
/**
 * A file that could not be read as text proves nothing either way: below blocking, so it alone
 * never stops an install, but a report with one is never "safe".
 */
const UNCHECKED_CONFIDENCE = 0.5;
const UNCHECKED_PREFIX = "unchecked.";

type LineContext = "code" | "comment" | "prose";

function extensionOf(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? "" : name.slice(dot).toLowerCase();
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function factorFor(rule: SafetyRule, context: LineContext): number {
  if (context === "comment") return COMMENT_FACTOR;
  // Prose is what the agent is told: injection rules count in full there, commands less.
  if (context === "prose") return rule.category === "injection" ? 1 : PROSE_FACTOR;
  return 1;
}

/** The text around where `rule` matched, so a hit deep in a long line still shows. */
function excerptOf(rule: SafetyRule, content: string): string {
  if (content.length <= MAX_EXCERPT) return shorten(content);
  const at = rule.regex.exec(content)?.index ?? 0;
  const from = Math.max(0, at - MAX_EXCERPT / 4);
  return shorten(`${from > 0 ? "…" : ""}${content.slice(from, from + MAX_EXCERPT)}`);
}

interface TextScan {
  push(text: string): void;
  end(): SafetyFinding[];
}

/**
 * The rules over one file's text, fed in chunks of any size. Each line is checked with where it
 * sits: code, a comment, or a document's prose (outside fences); a long one piece by piece.
 */
function createTextScan(file: string, document: boolean): TextScan {
  const findings: SafetyFinding[] = [];
  const seen = new Set<string>();
  let fence: string | null = null;
  /** Where the line under way sits, decided by its first piece; null while none is known. */
  let current: { line: number; context: LineContext | null } = { line: 0, context: null };

  const check = (line: number, content: string, context: LineContext): void => {
    if (!content.trim()) return;
    for (const rule of SAFETY_RULES) {
      if (rule.documentsOnly && !document) continue;
      if (!rule.regex.test(content) || rule.skip?.(content)) continue;
      // Piece borders repeat text: still one finding per rule per line.
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
        excerpt: secret ? "" : excerptOf(rule, content),
        explanation: rule.explanation,
        remediation: rule.remediation,
      });
    }
  };

  const contextOf = (content: string, ends: boolean): LineContext | null => {
    if (!document) return COMMENT_PATTERN.test(content) ? "comment" : "code";
    const marker = FENCE_PATTERN.exec(content)?.[1];
    if (!marker) return fence === null ? "prose" : "code";
    if (fence === null) fence = marker.charAt(0);
    else if (marker.charAt(0) === fence) fence = null;
    // A fence line only opens or closes a block; the rest of a long one is still read.
    return ends ? null : "code";
  };

  const splitter = createLineSplitter(
    (content, line, ends) => {
      if (current.line !== line) current = { line, context: contextOf(content, ends) };
      if (current.context) check(line, content, current.context);
    },
    { pieceChars: PIECE_CHARS, overlapChars: PIECE_OVERLAP },
  );
  return {
    push: (text) => splitter.push(text),
    end() {
      splitter.end();
      return findings;
    },
  };
}

type UncheckedReason = "binary" | "unreadable";

const UNCHECKED_TEXT: Record<UncheckedReason, { pattern: string; explanation: string }> = {
  binary: {
    pattern: "Binary file",
    explanation: "Holds binary data, so it could not be checked as text.",
  },
  unreadable: {
    pattern: "Unreadable file",
    explanation: "Could not be opened, so it was not checked.",
  },
};

/** A file the rules could not read, named in the report so its verdict is never "safe". */
function uncheckedFinding(
  file: ContentFile,
  reason: UncheckedReason,
  runnable: boolean,
): SafetyFinding {
  const { pattern, explanation } = UNCHECKED_TEXT[reason];
  return {
    id: `${UNCHECKED_PREFIX}${reason}`,
    category: UNCHECKED_CATEGORY,
    pattern: runnable ? `${pattern} that can run` : pattern,
    severity: runnable ? "HIGH" : "LOW",
    confidence: UNCHECKED_CONFIDENCE,
    file: file.relativePath,
    line: null,
    excerpt: "",
    explanation: runnable
      ? `${explanation} It is a program, a script or compiled code, so it may run.`
      : `${explanation} Nothing runs it on its own, but a script in the skill could.`,
    remediation: runnable
      ? "Ship the source instead, or find out what it does before installing."
      : "Find out what uses this file before installing.",
  };
}

/** What the rules make of one file: its findings, and why it could not be read, if so. */
function scanFile(file: ContentFile): SafetyFinding[] {
  const extension = extensionOf(file.relativePath);
  const runnable = file.executable || RUNNABLE_EXTENSIONS.has(extension);
  if (!runnable && SKIPPED_EXTENSIONS.has(extension)) return [];
  const scan = createTextScan(file.relativePath, DOCUMENT_EXTENSIONS.has(extension));
  let binary: boolean;
  try {
    binary = readTextChunks(file.absolutePath, scan.push, runnable);
  } catch {
    return [uncheckedFinding(file, "unreadable", runnable)];
  }
  if (!binary) return scan.end();
  // Whatever text a runnable binary holds is still worth the rules.
  return [uncheckedFinding(file, "binary", runnable), ...(runnable ? scan.end() : [])];
}

/**
 * The rules over every file copied with a skill, whatever its size, as one report. What cannot
 * be read as text is named in it, never passed as safe. Reads, never writes.
 */
export function scanWithRules(dir: string, scannedAt = Date.now()): SafetyReport {
  const all: SafetyFinding[] = [];
  for (const file of listContentFiles(dir, isNeverCopiedName)) all.push(...scanFile(file));
  let weight = 0;
  for (const finding of all) {
    // Nothing of an unchecked file was read, so it adds nothing to the risk score.
    if (finding.id.startsWith(UNCHECKED_PREFIX)) continue;
    weight += SEVERITY_WEIGHT[finding.severity] * finding.confidence;
  }
  return buildReport({
    engine: "builtin",
    findings: all,
    score: Math.min(100, Math.round(weight)),
    blocking: all.some(
      (finding) =>
        isBlockingSeverity(finding.severity) && finding.confidence >= BLOCKING_CONFIDENCE,
    ),
    scannerVersion: BUILTIN_RULES_VERSION,
    scannedAt,
  });
}
