/**
 * What never leaves this computer: kept out of the backup and out of a published copy alike.
 * Only names that are never skill content: tool output, installed dependencies and local
 * secrets. Written as `.gitignore` lines, so the backup uses them as they are; shown to the user
 * as the backup's defaults.
 *
 * Order matters, as in `.gitignore`: a later `!` line keeps a file an earlier line left out.
 * `.env.example` and its kin document the variables and hold no values, so they stay content.
 */
export const LEFT_OUT_LINES: readonly string[] = [
  ".DS_Store",
  "Thumbs.db",
  "__pycache__/",
  "*.pyc",
  "node_modules/",
  ".venv/",
  "venv/",
  ".env",
  ".env.*",
  "!.env*.example",
  "!.env*.sample",
  "!.env*.template",
  "*.log",
];

const NEGATION = "!";
const DIRECTORY_MARK = "/";

interface Rule {
  pattern: RegExp;
  keep: boolean;
  directoryOnly: boolean;
}

/** A name-only `.gitignore` pattern (`*` and literal text) as an anchored regular expression. */
function namePattern(glob: string): RegExp {
  const source = glob
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  // Case is ignored, as on the macOS and Windows disks most libraries live on.
  return new RegExp(`^${source}$`, "i");
}

const RULES: readonly Rule[] = LEFT_OUT_LINES.map((line) => {
  const keep = line.startsWith(NEGATION);
  const body = keep ? line.slice(NEGATION.length) : line;
  const directoryOnly = body.endsWith(DIRECTORY_MARK);
  return {
    pattern: namePattern(directoryOnly ? body.slice(0, -DIRECTORY_MARK.length) : body),
    keep,
    directoryOnly,
  };
});

/** True when a file or folder of this name never leaves this computer. */
export function isLeftOut(name: string, directory: boolean): boolean {
  let leftOut = false;
  for (const rule of RULES) {
    if (rule.directoryOnly && !directory) continue;
    if (rule.pattern.test(name)) leftOut = !rule.keep;
  }
  return leftOut;
}
