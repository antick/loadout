import type { SafetySeverity } from "@loadout/shared";
import { SECRET_PATTERNS } from "../util/secret-patterns";

/**
 * Loadout's own safety rules: what a skill's files must not tell an agent to do. Static pattern
 * matching over every text file of a skill, no model and no key, so every install is checked
 * even without SkillSpector. Each rule carries a confidence; where a hit lands (a comment, prose
 * in a document) lowers it, and the verdict comes from the weighted whole.
 */

/** The rule set as a version, kept in each report so a changed set shows as a stale check. */
export const BUILTIN_RULES_VERSION = "3";

/** The category of a file the rules could not read as text. */
export const UNCHECKED_CATEGORY = "Not checked";

export type RuleCategory =
  | "destructive"
  | "network"
  | "privilege"
  | "payload"
  | "injection"
  | "credentials";

export const CATEGORY_LABELS: Record<RuleCategory, string> = {
  destructive: "Destructive command",
  network: "Network exfiltration",
  privilege: "Privilege escalation",
  payload: "Suspicious payload",
  injection: "Prompt injection",
  credentials: "Credential access",
};

export interface SafetyRule {
  id: string;
  category: RuleCategory;
  /** Short name of what was matched, e.g. "Pipe to shell". */
  pattern: string;
  severity: SafetySeverity;
  /** 0–1, before the context lowers it. */
  confidence: number;
  /**
   * Tested per line; never global. Case-insensitive where what it matches is: paths (macOS and
   * Windows disks ignore case) and words in prose. Commands and key formats keep their case.
   */
  regex: RegExp;
  explanation: string;
  remediation: string;
  /** Only meant for documents an agent reads (Markdown, text), not for code. */
  documentsOnly?: boolean;
  /** A hit to leave alone, e.g. deleting a build folder. */
  skip?: (line: string) => boolean;
}

/** Folders `rm -rf` may clear without anyone minding. */
const HARMLESS_RM_TARGETS =
  /rm\s+-[a-z]*\s+(["']?\.?\/?)?(node_modules|dist|build|out|target|__pycache__|\.cache|\.next|\.turbo|\.parcel-cache|coverage|\.nuxt|\.output|tmp|temp|\.venv|venv)\b/i;

const CREDENTIAL_WORDS =
  "(api[_ -]?key|token|password|passwd|secret|credential|\\.env\\b|ssh key|private key)";

export const SAFETY_RULES: readonly SafetyRule[] = [
  // ── Destructive ──
  {
    id: "destructive.rm_root",
    category: "destructive",
    pattern: "Delete everything",
    severity: "CRITICAL",
    confidence: 0.95,
    regex:
      /\brm\s+-[a-z]*[rf][a-z]*\s+(?:--no-preserve-root\s+)?(?:\/|~|\$HOME|\$\{HOME\}|\*)(?:\s|$|\/\*)/i,
    explanation: "Deletes the whole disk, the home folder, or everything in the current folder.",
    remediation: "Delete only the files the skill made, by name.",
  },
  {
    id: "destructive.rm_variable",
    category: "destructive",
    pattern: "Delete a folder named by a variable",
    severity: "MEDIUM",
    confidence: 0.55,
    regex: /\brm\s+-[a-z]*r[a-z]*\s+["']?\$\{?[A-Za-z_]+\}?["']?\/?(?:\s|$|["'])/,
    explanation: "An empty or unexpected variable turns this into deleting far more than intended.",
    remediation: "Check the variable is set and points where expected before deleting.",
    skip: (line) => HARMLESS_RM_TARGETS.test(line),
  },
  {
    id: "destructive.mkfs",
    category: "destructive",
    pattern: "Format a disk",
    severity: "CRITICAL",
    confidence: 0.9,
    regex: /\bmkfs(?:\.\w+)?\b|\bdiskutil\s+(?:erase|reformat)/i,
    explanation: "Formats a disk or partition, destroying what is on it.",
    remediation: "A skill has no business formatting disks.",
  },
  {
    id: "destructive.dd_device",
    category: "destructive",
    pattern: "Write to a raw device",
    severity: "CRITICAL",
    confidence: 0.95,
    regex: /\bdd\s+[^\n]*\bof=\/dev\/(?:sd|hd|nvme|disk|mmcblk)/i,
    explanation: "Writes raw bytes over a disk.",
    remediation: "Remove it.",
  },
  {
    id: "destructive.fork_bomb",
    category: "destructive",
    pattern: "Fork bomb",
    severity: "CRITICAL",
    confidence: 0.99,
    regex: /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/,
    explanation: "Starts processes until the computer stops responding.",
    remediation: "Remove it.",
  },
  {
    id: "destructive.kill_all",
    category: "destructive",
    pattern: "Kill every process",
    severity: "HIGH",
    confidence: 0.8,
    regex: /\bkill\s+-9\s+-1\b|\b(?:killall|pkill)\s+-9\s+-?\w*\s*$/i,
    explanation: "Ends every process the user can reach, including unsaved work.",
    remediation: "Stop only the process the skill started, by its id.",
  },
  {
    id: "destructive.system_write",
    category: "destructive",
    pattern: "Overwrite system files",
    severity: "HIGH",
    confidence: 0.7,
    regex:
      />\s*\/(?:etc|boot|usr|bin|sbin|lib|System)\/|\btee\s+(?:-a\s+)?\/(?:etc|boot|usr|bin|sbin|lib)\//,
    explanation: "Writes into folders the operating system relies on.",
    remediation: "Write inside the project or the user's own folders.",
  },
  {
    id: "destructive.git_rewrite",
    category: "destructive",
    pattern: "Rewrite or discard Git history",
    severity: "MEDIUM",
    confidence: 0.6,
    regex: /\bgit\s+push\s+[^\n]*(?:--force\b|\s-f\b)|\bgit\s+(?:reset\s+--hard|clean\s+-[a-z]*f)/i,
    explanation: "Throws away commits or working changes, possibly other people's.",
    remediation: "Ask before rewriting history; prefer commands that keep what is there.",
  },

  // ── Network ──
  {
    id: "network.pipe_to_shell",
    category: "network",
    pattern: "Run downloaded code",
    severity: "HIGH",
    confidence: 0.9,
    regex:
      /\b(?:curl|wget|Invoke-WebRequest|iwr)\b[^\n|]*\|\s*(?:sudo\s+)?(?:ba|z|da|k|fi)?sh\b|\biex\s*\(?\s*\(?\s*(?:iwr|Invoke-WebRequest|New-Object\s+Net\.WebClient)/i,
    explanation: "Downloads a script and runs it at once, so what runs can change at any time.",
    remediation: "Ship the script with the skill and run the copy.",
  },
  {
    id: "network.reverse_shell",
    category: "network",
    pattern: "Reverse shell",
    severity: "CRITICAL",
    confidence: 0.9,
    regex:
      /\/dev\/tcp\/|\b(?:nc|ncat|netcat)\b[^\n]*\s-[a-z]*e\s|\bsocat\b[^\n]*\bexec:|\bos\.dup2\(/i,
    explanation: "Opens a connection that gives someone else a shell on this computer.",
    remediation: "Remove it.",
  },
  {
    id: "network.send_secrets",
    category: "network",
    pattern: "Send secrets to a server",
    severity: "HIGH",
    confidence: 0.85,
    regex: new RegExp(
      `\\b(?:curl|wget|fetch|requests\\.(?:post|put)|axios\\.post|Invoke-RestMethod|http\\.post)\\b[^\\n]*(?:\\$\\{?[A-Za-z_]*(?:KEY|TOKEN|SECRET|PASSWORD)|${CREDENTIAL_WORDS}|id_rsa|\\.aws\\/|\\.ssh\\/)`,
      "i",
    ),
    explanation: "Puts a key, token or credential file into a web request.",
    remediation: "Never send credentials anywhere the user did not ask for.",
  },
  {
    id: "network.webhook",
    category: "network",
    pattern: "Talk to a collection endpoint",
    severity: "MEDIUM",
    confidence: 0.6,
    regex:
      /hooks\.slack\.com\/services|discord(?:app)?\.com\/api\/webhooks|webhook\.site|requestbin|pipedream\.net|ngrok(?:-free)?\.(?:app|io|dev)|burpcollaborator|interact\.sh|oastify\.com/i,
    explanation: "Sends data to a webhook or a catch-all endpoint, a common way to take data out.",
    remediation: "Take out anything that phones home.",
  },
  {
    id: "network.bare_ip",
    category: "network",
    pattern: "Bare IP address",
    severity: "LOW",
    confidence: 0.4,
    regex:
      /https?:\/\/(?!(?:127\.0\.0\.1|0\.0\.0\.0|10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.))\d{1,3}(?:\.\d{1,3}){3}\b/,
    explanation: "Talks to a server by its address alone, which nothing can vouch for.",
    remediation: "Name the service; explain why it is contacted.",
  },
  {
    id: "network.copy_out",
    category: "network",
    pattern: "Copy files to a remote host",
    severity: "MEDIUM",
    confidence: 0.5,
    regex: /\b(?:scp|rsync|sftp)\b[^\n]*\s\S+@\S+:/,
    explanation: "Copies files to another computer.",
    remediation: "Only with the user's say-so, to a host they named.",
  },

  // ── Privilege ──
  {
    id: "privilege.sudo",
    category: "privilege",
    pattern: "Runs as root",
    severity: "LOW",
    confidence: 0.4,
    regex: /(?:^|[\s;&|(])sudo\s+/,
    explanation: "Asks for administrator rights.",
    remediation: "Say why, and keep it to the one command that needs it.",
  },
  {
    id: "privilege.world_writable",
    category: "privilege",
    pattern: "World-writable permissions",
    severity: "MEDIUM",
    confidence: 0.7,
    regex: /\bchmod\s+(?:-R\s+)?(?:777|666|a\+rwx?|o\+w)\b/,
    explanation: "Lets every user on the computer change the files.",
    remediation: "Give the owner what is needed and nobody else.",
  },
  {
    id: "privilege.setuid",
    category: "privilege",
    pattern: "Set-user-id bit",
    severity: "HIGH",
    confidence: 0.8,
    regex: /\bchmod\s+[^\n]*\b[ug]\+s\b|\bchmod\s+(?:-R\s+)?[2-7][0-7]{3}\b/,
    explanation: "Makes a program run with its owner's rights, a classic way to keep root access.",
    remediation: "Remove it.",
  },
  {
    id: "privilege.shell_startup",
    category: "privilege",
    pattern: "Change the shell start-up file",
    severity: "HIGH",
    confidence: 0.8,
    regex:
      />>?\s*["']?(?:~|\$HOME)?\/?\.(?:bashrc|zshrc|bash_profile|zprofile|profile|zshenv|config\/fish\/config\.fish)\b|\bProfile\.ps1\b/i,
    explanation: "Writes into a file that runs every time a terminal opens.",
    remediation: "Tell the user what to add; never write it for them.",
  },
  {
    id: "privilege.persistence",
    category: "privilege",
    pattern: "Run again at start-up",
    severity: "MEDIUM",
    confidence: 0.7,
    regex:
      /\bcrontab\b|\/etc\/cron|\bsystemctl\s+enable\b|\blaunchctl\s+(?:load|bootstrap)\b|LaunchAgents|LaunchDaemons|\bschtasks\b|\\CurrentVersion\\Run\b/i,
    explanation: "Sets something up to keep running after the skill is done.",
    remediation: "Nothing a skill installs should outlive the task.",
  },
  {
    id: "privilege.agent_settings",
    category: "privilege",
    pattern: "Change the agent's own settings",
    severity: "MEDIUM",
    confidence: 0.6,
    regex:
      /(?:>|\bwrite|\btee|\bcp\b|\bmv\b)[^\n]*\.(?:claude|codex|cursor|gemini)\/(?:settings(?:\.local)?\.json|config\.toml|mcp\.json|hooks\.json)/i,
    explanation: "Rewrites the agent's settings, hooks or tool permissions.",
    remediation: "Describe the setting; let the user change it.",
  },
  {
    id: "privilege.shadow_command",
    category: "privilege",
    pattern: "Shadow a common command",
    severity: "MEDIUM",
    confidence: 0.6,
    regex: /\balias\s+(?:sudo|ls|cd|git|ssh|npm|python3?|node)=/,
    explanation: "Makes an everyday command run something else.",
    remediation: "Remove it.",
  },

  // ── Payload ──
  {
    id: "payload.base64_exec",
    category: "payload",
    pattern: "Decode and run hidden code",
    severity: "HIGH",
    confidence: 0.9,
    regex:
      /base64\s+(?:-d|--decode|-D)\b[^\n]*\|\s*(?:sudo\s+)?(?:ba|z)?sh\b|\becho\s+["']?[A-Za-z0-9+/=]{40,}["']?\s*\|\s*base64|FromBase64String|b64decode\([^\n]*\)[^\n]*(?:exec|eval)/i,
    explanation: "The code that runs is hidden inside an encoded blob.",
    remediation: "Write the code out where it can be read.",
  },
  {
    id: "payload.eval",
    category: "payload",
    pattern: "Eval",
    severity: "MEDIUM",
    confidence: 0.55,
    regex: /\beval\s*\(|(?:^|[\s;|&])eval\s+["'$]/,
    explanation: "Runs text as code, so what runs is not what is written.",
    remediation: "Call the code directly.",
  },
  {
    id: "payload.exec_download",
    category: "payload",
    pattern: "Run downloaded code",
    severity: "HIGH",
    confidence: 0.8,
    regex:
      /\bexec\(\s*(?:urllib|requests|urlopen|base64)|\bnew\s+Function\(\s*(?:await\s+)?(?:fetch|require\(["']https?)/i,
    explanation: "Fetches code from the internet and runs it.",
    remediation: "Ship the code with the skill.",
  },
  {
    id: "payload.powershell_hidden",
    category: "payload",
    pattern: "Hidden or encoded PowerShell",
    severity: "HIGH",
    confidence: 0.85,
    regex:
      /powershell[^\n]*-(?:enc|encodedcommand|e)\s|-ExecutionPolicy\s+Bypass|-WindowStyle\s+Hidden/i,
    explanation: "Runs PowerShell in a way meant not to be seen or checked.",
    remediation: "Run a plain script the user can read.",
  },
  {
    id: "payload.hex_blob",
    category: "payload",
    pattern: "Hex-encoded blob",
    severity: "MEDIUM",
    confidence: 0.6,
    regex: /(?:\\x[0-9a-f]{2}){12,}/i,
    explanation: "A long run of hex escapes, the usual shape of hidden code or shellcode.",
    remediation: "Write the text out plainly.",
  },
  {
    id: "payload.char_codes",
    category: "payload",
    pattern: "Text built from character codes",
    severity: "LOW",
    confidence: 0.4,
    regex: /String\.fromCharCode\(\s*\d+\s*,|chr\(\d+\)\s*\+\s*chr\(/,
    explanation: "Builds a string from numbers, which hides what it says.",
    remediation: "Write the string out plainly.",
  },

  // ── Prompt injection (documents the agent reads) ──
  {
    id: "injection.override",
    category: "injection",
    pattern: "Instruction override",
    severity: "HIGH",
    confidence: 0.85,
    regex:
      /\b(?:ignore|disregard|forget)\s+(?:all\s+|any\s+)?(?:of\s+)?(?:your\s+|the\s+)?(?:previous|prior|above|earlier|system|original)\s+(?:instructions|rules|guidelines|prompt)/i,
    explanation: "Tells the agent to drop the instructions it was given.",
    remediation: "A skill adds to the agent's instructions; it does not replace them.",
    documentsOnly: true,
  },
  {
    id: "injection.hide_from_user",
    category: "injection",
    pattern: "Hide from the user",
    severity: "HIGH",
    confidence: 0.8,
    regex:
      /\b(?:do\s+not|don't|never|without)\s+(?:tell(?:ing)?|show(?:ing)?|reveal(?:ing)?|mention(?:ing)?|inform(?:ing)?|disclos(?:e|ing)|let(?:ting)?)\s+(?:this\s+to\s+)?the\s+user\b/i,
    explanation: "Tells the agent to keep something from the person it works for.",
    remediation: "Everything a skill does should be visible to the user.",
    documentsOnly: true,
  },
  {
    id: "injection.no_consent",
    category: "injection",
    pattern: "Act without asking",
    severity: "MEDIUM",
    confidence: 0.6,
    regex:
      /\bwithout\s+(?:asking|confirmation|permission|the\s+user(?:'s)?\s+(?:consent|knowledge|approval))\b|\bsilently\s+(?:run|execute|install|send|delete|remove|upload)\b/i,
    explanation: "Tells the agent to skip the user's OK for something.",
    remediation: "Keep the user in the loop for anything that changes or sends things.",
    documentsOnly: true,
  },
  {
    id: "injection.mode_switch",
    category: "injection",
    pattern: "Jailbreak",
    severity: "HIGH",
    confidence: 0.8,
    regex:
      /\byou\s+are\s+now\s+(?:in\s+)?(?:developer|god|admin|unrestricted|jailbreak|dan)\s+mode\b|\bno\s+(?:restrictions|limits|rules)\s+apply\b/i,
    explanation: "Tries to switch the agent into a mode without its safeguards.",
    remediation: "Remove it.",
    documentsOnly: true,
  },
  {
    id: "injection.exfiltrate",
    category: "injection",
    pattern: "Instruction to send secrets",
    severity: "HIGH",
    confidence: 0.8,
    regex: new RegExp(
      `\\b(?:send|upload|post|email|forward|paste)\\s+(?:the\\s+|all\\s+|any\\s+|your\\s+)?[^\\n]{0,40}?${CREDENTIAL_WORDS}[^\\n]{0,40}\\b(?:to|at)\\s+(?:https?:|[a-z0-9.-]+\\.[a-z]{2,})`,
      "i",
    ),
    explanation: "Tells the agent to send a key, token or credential file somewhere.",
    remediation: "Remove it.",
    documentsOnly: true,
  },

  // ── Credentials ──
  {
    id: "credentials.ssh",
    category: "credentials",
    pattern: "SSH keys",
    severity: "HIGH",
    confidence: 0.8,
    regex: /\.ssh\/(?:id_(?:rsa|ed25519|ecdsa|dsa)|authorized_keys|config)\b/i,
    explanation: "Reaches for the user's SSH keys or their SSH configuration.",
    remediation: "A skill should not touch SSH keys.",
  },
  {
    id: "credentials.cloud",
    category: "credentials",
    pattern: "Cloud and registry credentials",
    severity: "HIGH",
    confidence: 0.75,
    regex:
      /\.aws\/credentials|\.kube\/config|\.docker\/config\.json|\.npmrc|\.pypirc|\.netrc|\.git-credentials|\.config\/gh\/hosts\.yml|\.config\/gcloud/i,
    explanation: "Reaches for saved cloud, container or package registry credentials.",
    remediation: "Use the tool's own login; never read its credential file.",
  },
  {
    id: "credentials.env_file",
    category: "credentials",
    pattern: "Read a .env file",
    severity: "MEDIUM",
    confidence: 0.5,
    regex: /\b(?:cat|source|type|Get-Content|open)\s+[^\n]*\.env(?:\.[a-z]+)?\b/i,
    explanation: "Reads a file that usually holds keys and passwords.",
    remediation: "Read the one variable that is needed, from the environment.",
  },
  {
    id: "credentials.keychain",
    category: "credentials",
    pattern: "Keychain or password store",
    severity: "HIGH",
    confidence: 0.7,
    regex:
      /\bsecurity\s+(?:find|dump)-(?:generic|internet)?-?(?:password|keychain)|\bsecret-tool\s+lookup|\bop\s+(?:item\s+get|read)\b|Credential\s+Manager|\bcmdkey\b/i,
    explanation: "Reads passwords from the system's password store.",
    remediation: "Remove it.",
  },
  {
    id: "credentials.browser",
    category: "credentials",
    pattern: "Browser data",
    severity: "HIGH",
    confidence: 0.7,
    regex:
      /(?:Chrome|Chromium|Brave|Edge|Firefox)[^\n]*(?:Login Data|Cookies|Local State|logins\.json|key4\.db)|(?:Login Data|logins\.json|key4\.db)[^\n]*(?:Chrome|Chromium|Brave|Edge|Firefox)/i,
    explanation: "Reaches for saved browser passwords or cookies.",
    remediation: "Remove it.",
  },
  ...SECRET_PATTERNS.map((secret): SafetyRule => ({
    id: `credentials.hardcoded.${secret.kind}`,
    category: "credentials",
    pattern: "Key written into the file",
    severity: "MEDIUM",
    confidence: 0.7,
    regex: new RegExp(secret.regex.source, secret.regex.flags.replace("g", "")),
    explanation: "A key or token is written into the skill itself, for anyone who installs it.",
    remediation: "Take the key out; read it from the environment instead.",
  })),
];
