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
  isPlainUrl,
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
export { archiveLink, archiveLinkName, skillFileLink } from "./archive-link";
export { crossSiteHost, siteOf } from "./redirects";
export { type SkillsCommand, agentKeyFor, parseSkillsCommand } from "./skills-command";
export { skillFileFolder } from "./web-install";
export {
  type WellKnownEntry,
  type WellKnownIndex,
  fetchWellKnownSkill,
  findWellKnownIndex,
  isSiteCandidate,
  isWellKnownIndexUrl,
  parseWellKnownIndex,
  readWellKnownIndex,
  sha256Digest,
} from "./well-known";
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
  TAR_EXTENSIONS,
  ZIP_EXTENSIONS,
  archiveExtension,
  extractArchive,
  isArchivePath,
  unpackArchiveInto,
} from "./archive";
