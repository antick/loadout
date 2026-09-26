import type { InstallOptions, Skill } from "@loadout/shared";
import { isAppError } from "../errors";
import type { SafetyService } from "../safety/service";
import { readSkillIdentity } from "../skills/metadata";
import type { InstallIntoLibrary, InstallRequest } from "./library";

/** The part of the safety service installs use; absent in tests that do not care. */
export type SafetyGate = Pick<SafetyService, "check" | "remember">;

/** What a batch import says about a skill the safety check flagged. */
export const FLAGGED_IN_BATCH =
  "Flagged by the safety check, so it was not imported. Import it on its own to read the findings.";

/** The name a skill is checked under: the one it is given, else its frontmatter name. */
function candidateName(request: InstallRequest): string {
  return request.name?.trim() || readSkillIdentity(request.sourceDir).name;
}

/**
 * Install one skill after the safety check, keeping the report with the installed skill. Throws
 * UNSAFE, before anything is written, when the check flags it and `acceptRisk` is not set.
 */
export async function installChecked(
  install: InstallIntoLibrary,
  safety: SafetyGate | undefined,
  request: InstallRequest,
  options: InstallOptions & { progressKey?: string } = {},
): Promise<Skill> {
  if (!safety) return install(request);
  const [report] = await safety.check(
    [{ name: candidateName(request), dir: request.sourceDir }],
    options,
  );
  const skill = await install(request);
  safety.remember(skill, report ?? null);
  return skill;
}

/** A batch import never asks: a flagged skill becomes one of its failures, with this message. */
export function batchFailureMessage(error: unknown, fallback: string): string {
  return isAppError(error, "UNSAFE") ? FLAGGED_IN_BATCH : fallback;
}
