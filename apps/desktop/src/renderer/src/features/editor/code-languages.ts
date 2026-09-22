import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { python } from "@codemirror/lang-python";
import { yaml, yamlFrontmatter } from "@codemirror/lang-yaml";
import { StreamLanguage } from "@codemirror/language";
import { shell } from "@codemirror/legacy-modes/mode/shell";
import type { Extension } from "@codemirror/state";

/** What the editor knows about a file type: its highlighting and how the status bar names it. */
export interface CodeLanguage {
  id: string;
  label: string;
  /** Markdown files get the rendered preview next to the editor. */
  previewable: boolean;
  extension: () => Extension;
}

const MARKDOWN: CodeLanguage = {
  id: "markdown",
  label: "Markdown",
  previewable: true,
  // Skill documents open with YAML frontmatter; highlight it as YAML, the rest as GFM.
  extension: () => yamlFrontmatter({ content: markdown({ base: markdownLanguage }) }),
};

const PLAIN: CodeLanguage = {
  id: "text",
  label: "Plain text",
  previewable: false,
  extension: () => [],
};

const BY_EXTENSION: Record<string, CodeLanguage> = {
  md: MARKDOWN,
  markdown: MARKDOWN,
  mdx: MARKDOWN,
  yaml: { id: "yaml", label: "YAML", previewable: false, extension: () => yaml() },
  yml: { id: "yaml", label: "YAML", previewable: false, extension: () => yaml() },
  json: { id: "json", label: "JSON", previewable: false, extension: () => json() },
  js: { id: "js", label: "JavaScript", previewable: false, extension: () => javascript() },
  mjs: { id: "js", label: "JavaScript", previewable: false, extension: () => javascript() },
  cjs: { id: "js", label: "JavaScript", previewable: false, extension: () => javascript() },
  ts: {
    id: "ts",
    label: "TypeScript",
    previewable: false,
    extension: () => javascript({ typescript: true }),
  },
  py: { id: "python", label: "Python", previewable: false, extension: () => python() },
  sh: {
    id: "shell",
    label: "Shell",
    previewable: false,
    extension: () => StreamLanguage.define(shell),
  },
  bash: {
    id: "shell",
    label: "Shell",
    previewable: false,
    extension: () => StreamLanguage.define(shell),
  },
  zsh: {
    id: "shell",
    label: "Shell",
    previewable: false,
    extension: () => StreamLanguage.define(shell),
  },
};

/** The language for a file, judged by its extension. Unknown types are plain text. */
export function languageFor(path: string): CodeLanguage {
  const name = path.slice(path.lastIndexOf("/") + 1).toLowerCase();
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return PLAIN;
  return BY_EXTENSION[name.slice(dot + 1)] ?? PLAIN;
}
