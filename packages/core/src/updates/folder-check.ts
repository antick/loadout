import type { GitClient } from "../install";
import type { FolderTrees } from "../install/git-trees";
import { type RemoteTarget, remoteKey } from "./source";

/**
 * A commit to a repository that holds many skills leaves most of them as they were. When the
 * commit a skill was installed from and the latest one differ, the tree id of the skill's folder
 * at both says whether anything in it changed: the same id means no update to offer. Anything
 * unclear (no Git, a revision the server no longer serves, a folder that moved) answers "changed",
 * so the check never hides a real update.
 */

export interface FolderQuestion {
  target: RemoteTarget;
  /** The commit the skill was installed from. */
  from: string;
  /** The commit the repository serves now. */
  to: string;
}

/** True when the skill's folder is the same at both commits. */
export type FolderUnchanged = (question: FolderQuestion) => Promise<boolean>;

const pathOf = (target: RemoteTarget): string => target.subpath ?? "";
const keyOf = ({ target, from, to }: FolderQuestion): string =>
  `${remoteKey(target)}\n${from}\n${to}`;

/**
 * One round of checks. Every question planned up front for the same repository and commits is
 * answered from one fetch; a question not planned gets a fetch of its own.
 */
export function folderComparer(
  git: GitClient,
  planned: readonly FolderQuestion[] = [],
): FolderUnchanged {
  const paths = new Map<string, string[]>();
  for (const question of planned) {
    const list = paths.get(keyOf(question)) ?? [];
    if (!list.includes(pathOf(question.target))) list.push(pathOf(question.target));
    paths.set(keyOf(question), list);
  }
  const fetched = new Map<string, Promise<FolderTrees>>();

  return async (question) => {
    const key = keyOf(question);
    const path = pathOf(question.target);
    let list = paths.get(key);
    if (!list?.includes(path)) {
      list = [path];
      paths.set(key, list);
      fetched.delete(key);
    }
    let trees = fetched.get(key);
    if (!trees) {
      const { target, from, to } = question;
      trees = git
        .folderTrees(target.url, [from, to], list, { branch: target.branch })
        .catch((): FolderTrees => new Map());
      fetched.set(key, trees);
    }
    const found = await trees;
    const index = list.indexOf(path);
    const before = found.get(question.from)?.[index] ?? null;
    const after = found.get(question.to)?.[index] ?? null;
    return before !== null && before === after;
  };
}
