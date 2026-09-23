const HOME_SYMBOL = "~";

/** Replace the home directory prefix with `~` for display. Works with `/` and `\` separators. */
export function compactHome(path: string, homeDir: string | undefined): string {
  if (!homeDir) return path;
  const home = homeDir.replace(/[\\/]+$/, "");
  if (!home) return path;
  if (path === home) return HOME_SYMBOL;
  const next = path.charAt(home.length);
  if (path.startsWith(home) && (next === "/" || next === "\\")) {
    return `${HOME_SYMBOL}${path.slice(home.length)}`;
  }
  return path;
}

/**
 * `relative` (`/` separated) under the folder `base`, written with the separator `base` uses so a
 * Windows path stays a Windows path.
 */
export function joinPath(base: string, relative: string): string {
  const separator = base.includes("\\") && !base.includes("/") ? "\\" : "/";
  const segments = relative.split(/[\\/]+/).filter(Boolean);
  if (segments.length === 0) return base;
  return `${base.replace(/[\\/]+$/, "")}${separator}${segments.join(separator)}`;
}
