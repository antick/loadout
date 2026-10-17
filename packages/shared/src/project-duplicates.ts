/** Read-only comparison; only an identical, unchanged plan can be applied. */
export interface ProjectDuplicateCopy {
  path: string;
  agentName: string;
  agentKey: string;
  hash: string;
  files: { path: string; hash: string }[];
}

export interface ProjectDuplicatePlan {
  token: string;
  canonicalPath: string | null;
  copies: ProjectDuplicateCopy[];
  /** Existing links are preserved, including when their target becomes shared. */
  links: { path: string; targetPath: string }[];
  status: "identical" | "different" | "unsupported" | "resolved" | "none";
  reason: string | null;
  /** Persistent recovery is available even after closing the dialog or restarting. */
  canUndo: boolean;
}
