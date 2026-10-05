/** The install, marketplace and update parts of the API contract (see `api.ts`). */
import type { SourceCandidate, SourceChoice, SourceSearch } from "./origin";
import type { InstallOptions } from "./safety";
import type { SourceCheckResult, SourceNews } from "./sources";
import type {
  BatchResult,
  BatchUpdateResult,
  RefreshOptions,
  Skill,
  SourceDiff,
  SourceDiffOptions,
  SourceDocument,
  UpdateResult,
} from "./types";
import type {
  BatchImportResult,
  ConfirmOptions,
  GitPreview,
  InstallSelection,
  MarketBoard,
  MarketListing,
  MarketProvider,
  MarketSkillDetail,
  PreviewedSkill,
  ScanResult,
} from "./types-install";

export interface InstallApi {
  /** A folder containing a skill, or an archive (`.zip`, `.skill`, `.tar`, `.tar.gz`, `.tgz`). */
  fromPath(sourcePath: string, name?: string, options?: InstallOptions): Promise<Skill>;
  importFolder(folderPath: string): Promise<BatchImportResult>;
  /** Fetch a Git repository, or download an archive link, and list the skills in it. */
  previewGit(repoUrl: string): Promise<GitPreview>;
  /** List the skills in an archive file, for archives that hold more than one. */
  previewArchive(archivePath: string): Promise<GitPreview>;
  /**
   * Refused while the preview's download moved to another site and `acceptRedirect` is unset,
   * and with UNSAFE while the safety scanner flags a ticked skill and `acceptRisk` is unset.
   * Nothing is installed then, and the preview stays open for another try.
   */
  confirmGit(
    previewId: string,
    items: InstallSelection[],
    options?: ConfirmOptions,
  ): Promise<Skill[]>;
  cancelPreview(previewId: string): Promise<void>;
  /**
   * One skill of an open preview, read without installing it: its `SKILL.md` after the safety
   * check. UNSAFE like `confirmGit` while the check flags it and `acceptRisk` is unset.
   */
  readPreviewSkill(
    previewId: string,
    relPath: string,
    options?: InstallOptions,
  ): Promise<PreviewedSkill>;
  /** The same for a skill folder on this computer. */
  readFolderSkill(folderPath: string, options?: InstallOptions): Promise<PreviewedSkill>;
  /** The same for a ClawHub skill at its latest version. */
  readClawhubSkill(owner: string, slug: string, options?: InstallOptions): Promise<PreviewedSkill>;
  fromMarket(source: string, skillId: string, options?: InstallOptions): Promise<Skill>;
  /** A skill from the ClawHub registry, at its latest version. Progress key `clawhub:owner/slug`. */
  fromClawhub(owner: string, slug: string, options?: InstallOptions): Promise<Skill>;
  /** Returns whether anything was running under that key. */
  cancel(key: string): Promise<boolean>;
  scanLocal(): Promise<ScanResult>;
  importDiscovered(path: string, name?: string, options?: InstallOptions): Promise<Skill>;
  importAllDiscovered(): Promise<BatchImportResult>;
}

export interface MarketApi {
  /** A ranking; offline, the last copy fetched, with `cachedAt` saying how old it is. */
  board(board: MarketBoard, provider?: MarketProvider): Promise<MarketListing>;
  /** Live search; offline, the last answer to the same search, with `cachedAt`. */
  search(query: string, limit?: number, provider?: MarketProvider): Promise<MarketListing>;
  /** Security audits and the `SKILL.md` of one skill, to read before installing it. */
  detail(source: string, skillId: string, provider?: MarketProvider): Promise<MarketSkillDetail>;
}

export interface UpdateRequestOptions extends RefreshOptions {
  /**
   * The upstream revision the user compared against. When upstream moved on since, nothing is
   * installed (CHANGED_ON_DISK): the user never saw what the newer revision changes.
   */
  expectedRevision?: string | null;
}

/** A skill's source, opened once: what differs from the library copy, and its main document. */
export interface SourceComparison {
  diff: SourceDiff;
  document: SourceDocument;
}

export interface CheckAllOptions {
  /**
   * Only these skills (every skill when omitted). Each repository and branch among them is still
   * asked once. Ids of skills no longer in the library are skipped.
   */
  skillIds?: string[];
}

export interface UpdateManyOptions {
  /**
   * A check of these skills ran at or after this time (ms since the epoch). A skill it found newer
   * upstream is updated to the revision it found, without asking the remote again.
   */
  checkedSince?: number;
  /** Go ahead even where an update deletes files or replaces edits; held back otherwise. */
  approveRemovals?: boolean;
}

export interface UpdatesApi {
  check(skillId: string, force?: boolean): Promise<Skill>;
  checkAll(force?: boolean, options?: CheckAllOptions): Promise<BatchResult>;
  /**
   * The new version goes through the safety check first: flagged, it throws UNSAFE with the
   * findings and nothing changes, unless `options.acceptRisk` (the user said update anyway).
   * A skill from a folder, archive or archive link is re-imported (see `reimport`).
   */
  update(
    skillId: string,
    approval?: string | null,
    options?: UpdateRequestOptions,
  ): Promise<UpdateResult>;
  updateMany(skillIds: string[], options?: UpdateManyOptions): Promise<BatchUpdateResult>;
  reimport(
    skillId: string,
    approval?: string | null,
    options?: RefreshOptions,
  ): Promise<UpdateResult>;
  relink(
    skillId: string,
    sourcePath: string,
    approval?: string | null,
    options?: InstallOptions,
  ): Promise<UpdateResult>;
  /**
   * Forget the skill's source; its files stay as they are. `markAuthored` also marks it as yours,
   * so no source is looked for again (for a skill whose source is gone).
   */
  detach(skillId: string, options?: { markAuthored?: boolean }): Promise<Skill>;
  sourceDocument(skillId: string): Promise<SourceDocument>;
  sourceDiff(skillId: string, options?: SourceDiffOptions): Promise<SourceDiff>;
  /** `sourceDiff` and `sourceDocument` from one look at the source (one checkout). */
  compareSource(skillId: string, options?: SourceDiffOptions): Promise<SourceComparison>;
  /** When the last background update round finished (ms since the epoch); null when never. */
  lastAutoRunAt(): Promise<number | null>;
  /** New skills repositories gained, as the last look found them. No network. */
  sourceNews(): Promise<SourceNews[]>;
  /** Look at these repositories (all when omitted) for new skills; may add them (setting). */
  checkSources(sourceKeys?: string[]): Promise<SourceCheckResult>;
  /** Stop showing these new skills of a repository (all of them when `paths` is omitted). */
  dismissSourceNews(sourceKey: string, paths?: string[]): Promise<void>;
  /**
   * Look for where a skill without a source came from: the Git checkout it was imported from,
   * repositories its `SKILL.md` links to, and the marketplace. Each candidate is compared with
   * the library copy. Changes nothing.
   */
  findSource(skillId: string): Promise<SourceSearch>;
  /** Compare a skill with a repository the user named. Changes nothing. */
  lookUpSource(skillId: string, input: string): Promise<SourceCandidate>;
  /**
   * Make the skill follow a repository from now on. Its files stay as they are. When they differ
   * from the latest version, the skill shows an update, and updating asks before replacing them.
   */
  attachSource(skillId: string, choice: SourceChoice): Promise<Skill>;
}
