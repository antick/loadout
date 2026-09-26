import { statSync } from "node:fs";
import { shell } from "electron";

const MAC_BUNDLE_PATTERN = /\.(app|bundle|framework|plugin|prefpane|kext|appex|xpc)\/?$/i;

/**
 * Show a path in the OS file manager: a folder is opened, a file is shown selected in its folder.
 * `shell.openPath` alone would open a file with its default app (a `.zip` would be unpacked).
 */
export async function revealInFileManager(path: string): Promise<void> {
  let isFile = false;
  try {
    isFile = statSync(path).isFile();
  } catch {
    // Gone or unreadable: `openPath` reports it, and the folder fallback below takes over.
  }
  // On macOS a bundle (`Tool.app`) is a folder that `openPath` would launch, not show.
  if (isFile || (process.platform === "darwin" && MAC_BUNDLE_PATTERN.test(path))) {
    shell.showItemInFolder(path);
    return;
  }
  const failure = await shell.openPath(path);
  if (failure) shell.showItemInFolder(path);
}
