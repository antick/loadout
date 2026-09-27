/** Pushing a project skill to the library: the versions its copies hold and the outcome. */

/** One distinct content among the copies of a project skill, and the agents that hold it. */
export interface SkillVersion {
  /** Content hash of the copy; pass it to `pushToLibrary` to pick this version. */
  id: string;
  agents: { agentKey: string; agentName: string }[];
  /** Newest change to a file of the copy, epoch ms. */
  changedAt: number | null;
  fileCount: number;
  documentName: string;
  /** The main document, to compare versions. */
  document: string;
  /** This is what the library skill holds now. */
  matchesLibrary: boolean;
}

export interface PushToLibraryOptions {
  /** `SkillVersion.id` to add. Needed only when the copies differ from each other. */
  version?: string;
  /** Replace the other copies with the version added (default true). */
  realign?: boolean;
}

export interface PushToLibraryResult {
  /**
   * The copies hold more than one version and none was picked, so nothing was written; the
   * versions are in `versions`.
   */
  conflictingVariants: number;
  /** The distinct versions to choose from when `conflictingVariants` is set; empty otherwise. */
  versions: SkillVersion[];
  /** Copies that could not be realigned to the library after the push. */
  realignFailed: number;
  /** Recently removed ids of the other versions the realign replaced, for an undo. */
  removedIds: string[];
}
