import { type UsageAgentKey, isRecord } from "@loadout/shared";

/** One run of a skill found in a log. */
export interface UsageEvent {
  /** Unique within the agent, so a log read twice adds nothing. */
  eventId: string;
  name: string;
  usedAt: number;
  projectPath: string | null;
}

/** What a reader remembers while going through one log file. */
export interface LogFileState {
  /** The session's folder when the log names it once, at its top (Codex). */
  projectPath: string | null;
}

/** How to read one agent's session logs. */
export interface LogReader {
  agentKey: UsageAgentKey;
  /** A line holding none of these is skipped without being parsed. */
  markers: readonly string[];
  parse(line: string, state: LogFileState): UsageEvent[];
}

type Json = Record<string, unknown>;

const text = (value: unknown): string | null => (typeof value === "string" ? value : null);

function parseRecord(line: string): Json | null {
  try {
    const value: unknown = JSON.parse(line);
    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}

function timeOf(record: Json): number | null {
  const at = Date.parse(text(record.timestamp) ?? "");
  return Number.isFinite(at) ? at : null;
}

/**
 * A plugin's skill is named `plugin:skill`. It never comes from a skills folder, so it is never a
 * library skill.
 */
const PLUGIN_SEPARATOR = ":";
const isFolderSkillName = (name: string): boolean =>
  name.length > 0 && !name.includes(PLUGIN_SEPARATOR);

// Claude Code: `<session>.jsonl` under `~/.claude/projects/<project>/`, one record per line.
const CLAUDE_SKILL_TOOL = "Skill";
/** The model ran a skill: a `Skill` tool call. */
const CLAUDE_TOOL_MARKER = `"name":"${CLAUDE_SKILL_TOOL}"`;
/** The user ran one by name: `/skill-name`, recorded in the user's message. */
const CLAUDE_COMMAND_MARKER = "<command-name>";
const CLAUDE_COMMAND = /<command-name>\/?([^<\s]+)<\/command-name>/g;

/** Text the user typed: a plain string or text blocks, never a tool's result. */
function userText(message: unknown): string {
  if (!isRecord(message)) return "";
  const { content } = message;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((block) => isRecord(block) && block.type === "text")
    .map((block) => text((block as Json).text) ?? "")
    .join("\n");
}

function claudeSkillCalls(message: unknown): { id: string | null; name: string }[] {
  if (!isRecord(message) || !Array.isArray(message.content)) return [];
  return message.content.flatMap((block) => {
    if (!isRecord(block) || block.type !== "tool_use" || block.name !== CLAUDE_SKILL_TOOL) {
      return [];
    }
    const name = isRecord(block.input) ? text(block.input.skill) : null;
    return name ? [{ id: text(block.id), name }] : [];
  });
}

export const claudeCodeReader: LogReader = {
  agentKey: "claude_code",
  markers: [CLAUDE_TOOL_MARKER, CLAUDE_COMMAND_MARKER],
  parse(line) {
    const record = parseRecord(line);
    const usedAt = record ? timeOf(record) : null;
    if (!record || usedAt === null) return [];
    const projectPath = text(record.cwd);
    const recordId = text(record.uuid) ?? String(usedAt);
    const found: UsageEvent[] = [];
    if (record.type === "assistant") {
      for (const call of claudeSkillCalls(record.message)) {
        const eventId = call.id ?? `${recordId}:${call.name}`;
        found.push({ eventId, name: call.name, usedAt, projectPath });
      }
    } else if (record.type === "user") {
      for (const match of userText(record.message).matchAll(CLAUDE_COMMAND)) {
        const name = match[1] ?? "";
        found.push({ eventId: `${recordId}:${name}`, name, usedAt, projectPath });
      }
    }
    return found.filter((event) => isFolderSkillName(event.name));
  },
};

// Codex: `rollout-*.jsonl` under `~/.codex/sessions/<year>/<month>/<day>/`. It has no skill tool:
// it opens a skill's SKILL.md with a shell command, so a call that reads one is a run.
const CODEX_META = "session_meta";
const CODEX_META_MARKER = `"${CODEX_META}"`;
const CODEX_SKILL_MARKER = "SKILL.md";
const CODEX_CALL_TYPES: ReadonlySet<string> = new Set([
  "function_call",
  "custom_tool_call",
  "local_shell_call",
]);
/** Calls that write files: making or editing a skill is not running it. */
const CODEX_WRITING_TOOLS: ReadonlySet<string> = new Set(["apply_patch"]);
const CODEX_SKILL_PATH =
  /(?:^|[\s"'`/\\=:])skills[/\\]+([A-Za-z0-9][A-Za-z0-9._-]*)[/\\]+SKILL\.md/g;

/** A shell writing to the path just before it: `> path`, `>> path`, `tee path`. */
const CODEX_WRITE_BEFORE = /(?:>{1,2}|\btee\s+(?:-a\s+)?)\s*[^\s;|&<>]*$/;
/** How far back a write is looked for before a path. */
const CODEX_WRITE_LOOKBACK = 200;
/** A call opening more skills than this is going through them (a listing, an audit), not running them. */
const CODEX_MAX_SKILLS_PER_CALL = 8;

/** The skills a call's text opens, leaving out ones it writes to. */
function codexSkillsRead(callText: string): string[] {
  const names = new Set<string>();
  for (const match of callText.matchAll(CODEX_SKILL_PATH)) {
    const before = callText.slice(Math.max(0, match.index - CODEX_WRITE_LOOKBACK), match.index + 1);
    if (!CODEX_WRITE_BEFORE.test(before)) names.add(match[1] ?? "");
  }
  return names.size > CODEX_MAX_SKILLS_PER_CALL ? [] : [...names];
}

function codexCallText(payload: Json): string {
  const parts = [text(payload.arguments), text(payload.input)];
  if (isRecord(payload.action)) parts.push(JSON.stringify(payload.action));
  return parts.filter(Boolean).join("\n");
}

export const codexReader: LogReader = {
  agentKey: "codex",
  markers: [CODEX_SKILL_MARKER, CODEX_META_MARKER],
  parse(line, state) {
    const record = parseRecord(line);
    if (!record || !isRecord(record.payload)) return [];
    const { payload } = record;
    if (record.type === CODEX_META) {
      state.projectPath = text(payload.cwd) ?? state.projectPath;
      return [];
    }
    const usedAt = timeOf(record);
    const kind = text(payload.type) ?? "";
    if (record.type !== "response_item" || usedAt === null || !CODEX_CALL_TYPES.has(kind)) {
      return [];
    }
    if (CODEX_WRITING_TOOLS.has(text(payload.name) ?? "")) return [];
    const callId = text(payload.call_id) ?? text(payload.id) ?? String(usedAt);
    return codexSkillsRead(codexCallText(payload))
      .filter(isFolderSkillName)
      .map((name) => ({
        eventId: `${callId}:${name}`,
        name,
        usedAt,
        projectPath: state.projectPath,
      }));
  },
};

export const LOG_READERS: readonly LogReader[] = [claudeCodeReader, codexReader];
