import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { python } from "@codemirror/lang-python";
import { yaml, yamlFrontmatter } from "@codemirror/lang-yaml";
import { LanguageSupport, StreamLanguage, type StreamParser } from "@codemirror/language";
import { c, cpp, csharp, java, kotlin } from "@codemirror/legacy-modes/mode/clike";
import { css, sCSS } from "@codemirror/legacy-modes/mode/css";
import { diff } from "@codemirror/legacy-modes/mode/diff";
import { dockerFile } from "@codemirror/legacy-modes/mode/dockerfile";
import { go } from "@codemirror/legacy-modes/mode/go";
import { lua } from "@codemirror/legacy-modes/mode/lua";
import { perl } from "@codemirror/legacy-modes/mode/perl";
import { powerShell } from "@codemirror/legacy-modes/mode/powershell";
import { properties } from "@codemirror/legacy-modes/mode/properties";
import { r } from "@codemirror/legacy-modes/mode/r";
import { ruby } from "@codemirror/legacy-modes/mode/ruby";
import { rust } from "@codemirror/legacy-modes/mode/rust";
import { shell } from "@codemirror/legacy-modes/mode/shell";
import { standardSQL } from "@codemirror/legacy-modes/mode/sql";
import { swift } from "@codemirror/legacy-modes/mode/swift";
import { toml } from "@codemirror/legacy-modes/mode/toml";
import { html, xml } from "@codemirror/legacy-modes/mode/xml";

/** What the editor knows about a file type: its highlighting and how the status bar names it. */
export interface CodeLanguage {
  id: string;
  label: string;
  /** Markdown files get the rendered preview next to the editor. */
  previewable: boolean;
  /** Parser and editor support; null for plain text. */
  support: () => LanguageSupport | null;
}

/** A language with no preview, highlighted by `support`. */
const code = (id: string, label: string, support: () => LanguageSupport): CodeLanguage => ({
  id,
  label,
  previewable: false,
  support,
});

/** A language from CodeMirror's small line-by-line modes, built once on first use. */
function legacy(id: string, label: string, parser: StreamParser<unknown>): CodeLanguage {
  let built: LanguageSupport | null = null;
  return code(id, label, () => (built ??= new LanguageSupport(StreamLanguage.define(parser))));
}

const MARKDOWN: CodeLanguage = {
  id: "markdown",
  label: "Markdown",
  previewable: true,
  // Skill documents open with YAML frontmatter; highlight it as YAML, the rest as GFM.
  support: () => yamlFrontmatter({ content: markdown({ base: markdownLanguage }) }),
};

const PLAIN: CodeLanguage = {
  id: "text",
  label: "Plain text",
  previewable: false,
  support: () => null,
};

const YAML = code("yaml", "YAML", () => yaml());
const JSON_LANGUAGE = code("json", "JSON", () => json());
const JAVASCRIPT = code("js", "JavaScript", () => javascript());
const TYPESCRIPT = code("ts", "TypeScript", () => javascript({ typescript: true }));
const PYTHON = code("python", "Python", () => python());
const SHELL = legacy("shell", "Shell", shell);
const C = legacy("c", "C", c);
const CPP = legacy("cpp", "C++", cpp);
const CSS = legacy("css", "CSS", css);
const HTML = legacy("html", "HTML", html);
const XML = legacy("xml", "XML", xml);
const PROPERTIES = legacy("ini", "INI", properties);
const RUBY = legacy("ruby", "Ruby", ruby);
const PERL = legacy("perl", "Perl", perl);
const R = legacy("r", "R", r);
const DOCKERFILE = legacy("dockerfile", "Dockerfile", dockerFile);
const DIFF = legacy("diff", "Diff", diff);

const BY_EXTENSION: Record<string, CodeLanguage> = {
  md: MARKDOWN,
  markdown: MARKDOWN,
  mdx: MARKDOWN,
  yaml: YAML,
  yml: YAML,
  json: JSON_LANGUAGE,
  js: JAVASCRIPT,
  mjs: JAVASCRIPT,
  cjs: JAVASCRIPT,
  ts: TYPESCRIPT,
  py: PYTHON,
  sh: SHELL,
  bash: SHELL,
  zsh: SHELL,
  go: legacy("go", "Go", go),
  rs: legacy("rust", "Rust", rust),
  c: C,
  h: C,
  cpp: CPP,
  cc: CPP,
  hpp: CPP,
  java: legacy("java", "Java", java),
  kt: legacy("kotlin", "Kotlin", kotlin),
  cs: legacy("csharp", "C#", csharp),
  swift: legacy("swift", "Swift", swift),
  rb: RUBY,
  pl: PERL,
  r: R,
  lua: legacy("lua", "Lua", lua),
  ps1: legacy("powershell", "PowerShell", powerShell),
  sql: legacy("sql", "SQL", standardSQL),
  css: CSS,
  scss: legacy("scss", "SCSS", sCSS),
  html: HTML,
  htm: HTML,
  xml: XML,
  svg: XML,
  toml: legacy("toml", "TOML", toml),
  ini: PROPERTIES,
  cfg: PROPERTIES,
  env: PROPERTIES,
  diff: DIFF,
  patch: DIFF,
  dockerfile: DOCKERFILE,
};

/** Files known by their whole name rather than an extension. */
const BY_FILE_NAME: Record<string, CodeLanguage> = {
  dockerfile: DOCKERFILE,
  gemfile: RUBY,
  ".env": PROPERTIES,
};

/** Names a Markdown code fence may use for a language, beyond the file extensions above. */
const FENCE_ALIASES: Record<string, string> = {
  javascript: "js",
  jsx: "js",
  typescript: "ts",
  tsx: "ts",
  python: "py",
  shell: "sh",
  console: "sh",
  shellscript: "sh",
  jsonc: "json",
  golang: "go",
  rust: "rs",
  "c++": "cpp",
  kotlin: "kt",
  csharp: "cs",
  "c#": "cs",
  ruby: "rb",
  perl: "pl",
  powershell: "ps1",
  pwsh: "ps1",
  postgres: "sql",
  postgresql: "sql",
  mysql: "sql",
  sqlite: "sql",
  sass: "scss",
  properties: "ini",
  dotenv: "env",
};

/** The language of a Markdown code fence (```ts, ```bash …). Unknown ones are plain text. */
export function languageForFence(info: string): CodeLanguage {
  const name = info.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  return BY_EXTENSION[FENCE_ALIASES[name] ?? name] ?? PLAIN;
}

/** The language for a file, judged by its name or extension. Unknown types are plain text. */
export function languageFor(path: string): CodeLanguage {
  const name = path.slice(path.lastIndexOf("/") + 1).toLowerCase();
  const byName = BY_FILE_NAME[name];
  if (byName) return byName;
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return PLAIN;
  return BY_EXTENSION[name.slice(dot + 1)] ?? PLAIN;
}
