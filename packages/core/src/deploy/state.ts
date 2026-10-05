import type { DeployMode } from "@loadout/shared";
import { classifyTarget } from "./engine";

/**
 * What a recorded deployment looks like on disk, judged one way for the repair (at start and
 * `skills repair`), `doctor` and `skills status`:
 * - `ok`: a link to the skill, or a folder where a copy was put (an edited copy is still ours).
 * - `missing`: nothing there. The repair deploys it again.
 * - `broken`: a link row whose link leads nowhere or to another folder. The repair points it at
 *   the skill again.
 * - `not_ours`: something Loadout did not put there (a folder or file where its link was, a link
 *   or file where its copy was). Never overwritten: the repair leaves it alone.
 */
export type DeploymentState = "ok" | "missing" | "broken" | "not_ours";

export function deploymentState(
  row: { targetPath: string; mode: DeployMode },
  skill: { libraryPath: string },
): DeploymentState {
  const state = classifyTarget(row.targetPath, skill.libraryPath);
  if (state === "absent") return "missing";
  if (state === "link_to_source") return "ok";
  if (row.mode === "symlink") return state === "foreign_link" ? "broken" : "not_ours";
  return state === "real_dir" ? "ok" : "not_ours";
}
