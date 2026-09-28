import type {
  SkillsFileApplyOptions,
  SkillsFileInfo,
  SkillsFileInit,
  SkillsFilePlan,
  SkillsFileResult,
} from "./types-skills-file";

/** A project's `skills.toml` and its lock. `dir` is searched upwards for the file. */
export interface SkillsFileApi {
  find(dir: string): Promise<SkillsFileInfo | null>;
  /** What a skills file for `dir` would list: its skills the library knows from a repository. */
  suggest(dir: string): Promise<SkillsFileInit>;
  /** Write a new `skills.toml` in `dir`. ALREADY_EXISTS when there is one. */
  create(dir: string, init: SkillsFileInit): Promise<SkillsFileInfo>;
  /** Fetch the sources and say what applying would do. Writes nothing. */
  plan(dir: string, options?: SkillsFileApplyOptions): Promise<SkillsFilePlan>;
  apply(dir: string, options?: SkillsFileApplyOptions): Promise<SkillsFileResult>;
  /**
   * Remove every folder the lock says `apply` wrote and nobody changed since. `dryRun` only
   * says what would go.
   */
  unapply(
    dir: string,
    options?: Pick<SkillsFileApplyOptions, "force"> & { dryRun?: boolean },
  ): Promise<SkillsFileResult>;
}
