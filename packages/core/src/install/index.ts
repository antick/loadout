export { type InstallService, type InstallServiceDeps, createInstallService } from "./service";
export { type CancelHandle, CancelRegistry } from "./cancel";
export {
  type Checkout,
  type CheckoutOptions,
  type GitClient,
  type GitClientOptions,
  type RemoteOptions,
  CLONE_DIR_PREFIX,
  createGitClient,
  gitFailure,
} from "./git-client";
export {
  type GitInputOptions,
  type GitSource,
  type ListRefs,
  type RemoteRefs,
  marketSourceToUrl,
  normalizeRepoUrl,
  parseGitSource,
  redactUrl,
  repoNameFromUrl,
  resolveTreeRef,
  validateGitInput,
} from "./git-source";
export {
  type InstallIntoLibrary,
  type InstallRecord,
  type InstallRequest,
  installIntoLibrary,
} from "./library";
export {
  type FindOptions,
  type FoundSkill,
  findSkillDirs,
  listRepoSkills,
  resolveSkillDir,
} from "./repo-scan";
export {
  type Download,
  type DownloadOptions,
  MAX_DOWNLOAD_BYTES,
  createDownload,
  percentReporter,
} from "./download";
export { archiveLink, archiveLinkName } from "./archive-link";
export { GIT_NEEDED, withHttpFallback } from "./git-fallback";
export { type HttpGit, createHttpGit, parseAdvertisement } from "./http-git";
export {
  type ExtractedArchive,
  type UnpackedArchive,
  archiveSkillDir,
  archiveSkillDirs,
  listArchiveSkills,
  unpackArchive,
  unpackArchiveFile,
  ARCHIVE_EXTENSIONS,
  extractArchive,
  isArchivePath,
} from "./archive";
