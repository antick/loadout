import type { EditTarget } from "@loadout/shared";
import { joinPath } from "@/lib/paths";

/** Where the open file is on disk. An instruction file's target is the file itself. */
export function absoluteFilePath(target: EditTarget, relativePath: string): string {
  return target.location.kind === "instructions"
    ? target.path
    : joinPath(target.path, relativePath);
}
