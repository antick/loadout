/**
 * `npx skills add <source> --skill <name> -a <agent>`: the install command skill pages and READMEs
 * show. Pasting it where a source goes installs the same thing: the source is previewed, the named
 * skills ticked, and the named agents offered for deploying afterwards.
 */

export interface SkillsCommand {
  source: string;
  /** Skill names after `--skill` / `-s`; empty with {@link allSkills}. */
  skills: string[];
  /** Agent ids after `--agent` / `-a`, as the skills CLI spells them (`claude-code`). */
  agents: string[];
  /** `--skill '*'` or `--all`. */
  allSkills: boolean;
  /** `--agent '*'` or `--all`. */
  allAgents: boolean;
}

/** `npx skills add`, `bunx skills i`, `pnpm dlx skills install`, or `skills add` alone. */
const COMMAND_PREFIX =
  /^(?:(?:npx|bunx|pnpx|pnpm\s+dlx|yarn\s+dlx)\s+(?:-y\s+)?)?skills(?:@\S+)?\s+(?:add|install|a|i)\s+/i;
const SKILL_FLAGS: ReadonlySet<string> = new Set(["-s", "--skill"]);
const AGENT_FLAGS: ReadonlySet<string> = new Set(["-a", "--agent"]);
const ALL_FLAG = "--all";
const WILDCARD = "*";

/** Split on spaces outside quotes, dropping the quotes, as a shell would for plain arguments. */
function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  let started = false;
  for (const char of input) {
    if (quote) {
      if (char === quote) quote = null;
      else current += char;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      started = true;
      continue;
    }
    if (/\s/.test(char)) {
      if (started || current) tokens.push(current);
      current = "";
      started = false;
      continue;
    }
    current += char;
  }
  if (started || current) tokens.push(current);
  return tokens;
}

/** The command's parts, or null when `input` is not a skills CLI install command. */
export function parseSkillsCommand(input: string): SkillsCommand | null {
  const text = input.trim();
  const prefix = COMMAND_PREFIX.exec(text);
  if (!prefix) return null;
  const command: SkillsCommand = {
    source: "",
    skills: [],
    agents: [],
    allSkills: false,
    allAgents: false,
  };
  const tokens = tokenize(text.slice(prefix[0].length));
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index] ?? "";
    if (token === ALL_FLAG) {
      command.allSkills = true;
      command.allAgents = true;
      continue;
    }
    const takesSkills = SKILL_FLAGS.has(token);
    if (takesSkills || AGENT_FLAGS.has(token)) {
      // Values run until the next flag: `-s a b -a x` names two skills.
      while (index + 1 < tokens.length && !(tokens[index + 1] ?? "").startsWith("-")) {
        index += 1;
        const value = (tokens[index] ?? "").trim();
        if (!value) continue;
        if (value === WILDCARD) {
          if (takesSkills) command.allSkills = true;
          else command.allAgents = true;
        } else if (takesSkills) command.skills.push(value);
        else command.agents.push(value);
      }
      continue;
    }
    // Every other flag (`-g`, `-y`, `--copy`) changes nothing here; the first word is the source.
    if (!token.startsWith("-") && !command.source) command.source = token;
  }
  return command.source ? command : null;
}

/** Agent ids of the skills CLI whose Loadout key is not the id with `-` turned into `_`. */
const AGENT_ALIASES: Readonly<Record<string, string>> = {
  "antigravity-cli": "antigravity",
  "hermes-agent": "hermes",
  "iflow-cli": "iflow",
  kilo: "kilo_code",
  "kimi-code-cli": "kimi",
  "kiro-cli": "kiro",
  roo: "roo_code",
};

/** The Loadout agent key an id of the skills CLI means, or null when there is no such agent. */
export function agentKeyFor(id: string, known: ReadonlySet<string>): string | null {
  const lower = id.trim().toLowerCase();
  const candidates = [AGENT_ALIASES[lower], lower.replaceAll("-", "_"), lower];
  return candidates.find((key): key is string => key !== undefined && known.has(key)) ?? null;
}
