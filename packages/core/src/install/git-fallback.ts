import { AppError, isAppError } from "../errors";
import type { GitClient } from "./git-client";
import type { HttpGit } from "./http-git";

/** Shown when Git is missing and the repository cannot be fetched without it. */
export const GIT_NEEDED =
  "Git is not installed. Without Git, Loadout can only install public repositories from GitHub " +
  "and GitLab. Install Git (git-scm.com) for private repositories and other hosts.";

/**
 * A git client that uses system Git when it is there and plain HTTPS when it is not. Nothing
 * changes for a computer with Git: the fallback only answers calls that failed with GIT_MISSING.
 */
export function withHttpFallback(git: GitClient, http: HttpGit): GitClient {
  async function orHttp<T>(
    call: () => Promise<T>,
    canHelp: boolean,
    fallback: () => Promise<T>,
  ): Promise<T> {
    try {
      return await call();
    } catch (error) {
      if (!isAppError(error, "GIT_MISSING")) throw error;
      if (!canHelp) throw new AppError("GIT_MISSING", GIT_NEEDED);
      return fallback();
    }
  }

  return {
    gitVersion: git.gitVersion,
    clearCache: git.clearCache,
    lsRemote: (url, options) =>
      orHttp(
        () => git.lsRemote(url, options),
        http.canReadRefs(url),
        () => http.lsRemote(url, options),
      ),
    listRefs: (url, options) =>
      orHttp(
        () => git.listRefs(url, options),
        http.canReadRefs(url),
        () => http.listRefs(url, options),
      ),
    checkout: (url, options) =>
      orHttp(
        () => git.checkout(url, options),
        http.canDownload(url),
        () => http.checkout(url, options),
      ),
  };
}
