/**
 * The small glob language of suggest-for patterns, like `.gitignore`: `*` is anything but `/`,
 * `**` any number of folders, `?` one character. A pattern without a `/` matches a file or folder
 * name anywhere; one with a `/` matches a path from the project's top.
 */

const SPECIAL = /[.+^${}()|[\]\\]/g;

function toRegExp(pattern: string): RegExp {
  let source = "";
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index] ?? "";
    if (char === "*" && pattern[index + 1] === "*") {
      const slash = pattern[index + 2] === "/";
      source += slash ? "(?:.*/)?" : ".*";
      index += slash ? 2 : 1;
    } else if (char === "*") source += "[^/]*";
    else if (char === "?") source += "[^/]";
    else source += char.replace(SPECIAL, "\\$&");
  }
  return new RegExp(`^${source}$`, "i");
}

/** Match `pattern` against project paths (`/` separated, relative); the first path it fits. */
export function firstMatch(pattern: string, paths: readonly string[]): string | null {
  const clean = pattern.trim().replace(/^\.\//, "").replace(/\/+$/, "");
  if (!clean) return null;
  const expression = toRegExp(clean);
  const byName = !clean.includes("/");
  for (const path of paths) {
    const subject = byName ? (path.split("/").pop() ?? path) : path;
    if (expression.test(subject)) return path;
  }
  return null;
}
