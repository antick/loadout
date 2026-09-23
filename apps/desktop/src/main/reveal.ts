import { statSync } from "node:fs";
import { shell } from "electron";

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
  if (isFile) {
    shell.showItemInFolder(path);
    return;
  }
  const failure = await shell.openPath(path);
  if (failure) shell.showItemInFolder(path);
}
