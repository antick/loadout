import { existsSync, lstatSync } from "node:fs";
import { join } from "node:path";
import { shell } from "electron";

const MAC_BUNDLE_PATTERN =
  /\.(app|bundle|framework|plugin|prefpane|kext|appex|xpc|pkg|mpkg|workflow|saver|qlgenerator|mdimporter)\/?$/i;

/** A macOS bundle is a folder `openPath` would launch or install, whatever its name says. */
function isMacBundle(path: string): boolean {
  return MAC_BUNDLE_PATTERN.test(path) || existsSync(join(path, "Contents"));
}

/**
 * Show a path in the OS file manager: a folder is opened, a file is shown selected in its folder.
 * `shell.openPath` alone would open a file with its default app (a `.zip` would be unpacked).
 * A link is shown, never followed: a link named like a skill could point at an app, and opening
 * it would launch that app.
 */
export async function revealInFileManager(path: string): Promise<void> {
  let showInFolder = false;
  try {
    const stat = lstatSync(path);
    showInFolder =
      stat.isSymbolicLink() ||
      stat.isFile() ||
      (process.platform === "darwin" && stat.isDirectory() && isMacBundle(path));
  } catch {
    // Gone or unreadable: `openPath` reports it, and the folder fallback below takes over.
  }
  if (showInFolder) {
    shell.showItemInFolder(path);
    return;
  }
  const failure = await shell.openPath(path);
  if (failure) shell.showItemInFolder(path);
}
