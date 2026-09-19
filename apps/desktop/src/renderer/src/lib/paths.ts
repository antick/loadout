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
