/**
 * Folders inside WSL (Windows Subsystem for Linux), as Windows sees them:
 * `\\wsl.localhost\Ubuntu\home\me\.claude\skills` or the older `\\wsl$\Ubuntu\…`.
 * An agent running inside WSL reads such a folder as Linux, so it cannot follow a Windows link
 * into the library: skills are copied there instead.
 */

const WSL_ROOT = /^[\\/]{2}(?:wsl\$|wsl\.localhost)[\\/]+([^\\/]+)/i;

/** The path is inside a WSL distribution. Works on any OS; only Windows ever has such paths. */
export function isWslPath(path: string): boolean {
  return WSL_ROOT.test(path.trim());
}

/** Name of the WSL distribution a path is in, e.g. `Ubuntu`; null outside WSL. */
export function wslDistroOf(path: string): string | null {
  return WSL_ROOT.exec(path.trim())?.[1] ?? null;
}
