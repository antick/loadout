import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { python } from "@codemirror/lang-python";
import { yaml, yamlFrontmatter } from "@codemirror/lang-yaml";
import { LanguageSupport, StreamLanguage } from "@codemirror/language";
import { shell } from "@codemirror/legacy-modes/mode/shell";

/** What the editor knows about a file type: its highlighting and how the status bar names it. */
export interface CodeLanguage {
  id: string;
  label: string;
  /** Markdown files get the rendered preview next to the editor. */
  previewable: boolean;
  /** Parser and editor support; null for plain text. */
  support: () => LanguageSupport | null;
}

const shellSupport = (): LanguageSupport => new LanguageSupport(StreamLanguage.define(shell));

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

const BY_EXTENSION: Record<string, CodeLanguage> = {
  md: MARKDOWN,
  markdown: MARKDOWN,
  mdx: MARKDOWN,
  yaml: { id: "yaml", label: "YAML", previewable: false, support: () => yaml() },
  yml: { id: "yaml", label: "YAML", previewable: false, support: () => yaml() },
  json: { id: "json", label: "JSON", previewable: false, support: () => json() },
  js: { id: "js", label: "JavaScript", previewable: false, support: () => javascript() },
  mjs: { id: "js", label: "JavaScript", previewable: false, support: () => javascript() },
  cjs: { id: "js", label: "JavaScript", previewable: false, support: () => javascript() },
  ts: {
    id: "ts",
    label: "TypeScript",
    previewable: false,
    support: () => javascript({ typescript: true }),
  },
  py: { id: "python", label: "Python", previewable: false, support: () => python() },
  sh: {
    id: "shell",
    label: "Shell",
    previewable: false,
    support: shellSupport,
  },
  bash: {
    id: "shell",
    label: "Shell",
    previewable: false,
    support: shellSupport,
  },
  zsh: {
    id: "shell",
    label: "Shell",
    previewable: false,
    support: shellSupport,
  },
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
};

/** The language of a Markdown code fence (```ts, ```bash …). Unknown ones are plain text. */
export function languageForFence(info: string): CodeLanguage {
  const name = info.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  return BY_EXTENSION[FENCE_ALIASES[name] ?? name] ?? PLAIN;
}

/** The language for a file, judged by its extension. Unknown types are plain text. */
export function languageFor(path: string): CodeLanguage {
  const name = path.slice(path.lastIndexOf("/") + 1).toLowerCase();
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return PLAIN;
  return BY_EXTENSION[name.slice(dot + 1)] ?? PLAIN;
}
