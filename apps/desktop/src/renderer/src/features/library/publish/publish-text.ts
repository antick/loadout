import { type ClawhubProblem, type PublishSkip, formatBytes } from "@loadout/shared";
import type { TFunction } from "i18next";

/** What a skip or a ClawHub problem names in its sentence: the file, the limit, the folder. */
function paramsOf(item: PublishSkip | ClawhubProblem): Record<string, string> {
  return {
    ...("file" in item ? { file: item.file } : {}),
    ...("limitBytes" in item ? { limit: formatBytes(item.limitBytes) } : {}),
    ...("folder" in item ? { folder: item.folder } : {}),
  };
}

/** Why a skill is left out of a publish, in the app's words. */
export function skipText(skip: PublishSkip, t: TFunction): string {
  return t(`publish.skip.${skip.code}`, paramsOf(skip));
}

export const problemParams = (problem: ClawhubProblem): Record<string, string> =>
  paramsOf(problem);

/** A ClawHub problem told apart from the others of the same kind (one per file). */
export function problemKey(problem: ClawhubProblem): string {
  return "file" in problem ? `${problem.code}:${problem.file}` : problem.code;
}
