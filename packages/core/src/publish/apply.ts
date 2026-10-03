import { chmodSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { PublishSkillPlan } from "@loadout/shared";
import { AppError } from "../errors";
import { ensureDir, isInside, removePathSync } from "../util/fs";
import type { Checkout } from "./checkout";
import type { PlannedSkill } from "./plan";

/** Writing the skills into the working copy and committing them. Nothing here talks to the network. */

const FILE_MODE = 0o644;
const EXECUTABLE_MODE = 0o755;
const MESSAGE_NAMES_SHOWN = 4;

/** `Add pdf`, `Update pdf and docx`, `Add a; update b, c and 2 more`. */
function commitMessage(plans: readonly PublishSkillPlan[]): string {
  const list = (names: string[]): string => {
    const shown = names.slice(0, MESSAGE_NAMES_SHOWN);
    const rest = names.length - shown.length;
    if (rest > 0) return `${shown.join(", ")} and ${rest} more`;
    return shown.length > 1
      ? `${shown.slice(0, -1).join(", ")} and ${shown.at(-1)}`
      : (shown[0] ?? "");
  };
  const named = (status: PublishSkillPlan["status"]): string[] =>
    plans.filter((plan) => plan.status === status).map((plan) => plan.name);
  const added = named("new");
  const updated = named("changed");
  const parts = [
    added.length > 0 ? `Add ${list(added)}` : "",
    updated.length > 0 ? `${added.length > 0 ? "update" : "Update"} ${list(updated)}` : "",
  ].filter(Boolean);
  return parts.join("; ");
}

/**
 * Replace the folder of every new or changed skill with the planned files, stage them and commit.
 * Returns the commit, or null when git sees no difference after all.
 */
export async function writeAndCommit(
  checkout: Checkout,
  planned: readonly PlannedSkill[],
): Promise<string | null> {
  const todo = planned.filter(({ plan }) => plan.status === "new" || plan.status === "changed");
  for (const { plan, files } of todo) {
    const folder = join(checkout.dir, ...plan.folder.split("/"));
    // The name was checked already; this is the last line of defence against a path that leaves.
    if (!isInside(checkout.dir, folder) || folder === checkout.dir) {
      throw new AppError(
        "INVALID_INPUT",
        `Refusing to write outside the repository: ${plan.folder}`,
      );
    }
    removePathSync(folder);
    for (const file of files) {
      const to = join(folder, ...file.relativePath.split("/"));
      ensureDir(dirname(to));
      copyFileSync(file.absolutePath, to);
      chmodSync(to, file.executable ? EXECUTABLE_MODE : FILE_MODE);
    }
  }
  if (todo.length === 0) return null;
  // Forced: a `.gitignore` of the repository must not silently drop a skill the user chose.
  await checkout.run(["add", "--all", "--force", "--", ...todo.map(({ plan }) => plan.folder)]);
  const staged = await checkout.git.probe(["diff", "--cached", "--quiet"], { cwd: checkout.dir });
  if (staged.code === 0) return null;
  await checkout.run(["commit", "--quiet", "-m", commitMessage(todo.map(({ plan }) => plan))]);
  return checkout.text(["rev-parse", "HEAD"]);
}
