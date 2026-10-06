import type { MarketListing, UpdatesApi } from "@loadout/shared";
import type { CoreContext } from "../context";
import type { DeployService } from "../deploy";
import type { InstallService } from "../install";
import type { SafetyGate } from "../install/safety-gate";
import type { RemovedStore } from "../storage/removed";
import { type OriginFinder, createOriginFinder } from "../origin";
import type { SkillStore } from "../skills/store";
import {
  type SourceNewsStore,
  checkedSince,
  createSourceChecker,
  repositoryKeyOf,
} from "../sources";
import { type AutoUpdater, createAutoUpdater } from "./auto";
import { createChecker } from "./check";
import { createSourcePreview } from "./preview";
import { createUpdater } from "./update";

export interface UpdatesServiceDeps {
  store: SkillStore;
  /** Same git client, cancel registry and way into the library the installer uses. */
  install: Pick<InstallService, "git" | "download" | "clawhub" | "cancels" | "installIntoLibrary">;
  deploy: Pick<DeployService, "refreshCopies">;
  /** Checks every new version before it replaces the library copy. */
  safety: SafetyGate;
  /** Keeps the edited version an approved update replaces. */
  removed: Pick<RemovedStore, "keepCopy">;
  /** Shared with the installer, which marks what an import listed. */
  sourceNews: SourceNewsStore;
  /** Marketplace search, one of the places a skill's lost source is looked for. */
  searchMarket?: (query: string, limit?: number) => Promise<MarketListing>;
}

export interface UpdatesService {
  api: UpdatesApi;
  /** Background rounds; the host starts and stops them. */
  auto: AutoUpdater;
  /** Finds and links the source of skills without one. */
  origin: OriginFinder;
}

export function createUpdatesService(ctx: CoreContext, deps: UpdatesServiceDeps): UpdatesService {
  const { store, install, deploy } = deps;
  const checker = createChecker(ctx, {
    store,
    git: install.git,
    download: install.download,
    clawhub: install.clawhub,
  });
  const updater = createUpdater(ctx, {
    store,
    git: install.git,
    download: install.download,
    cancels: install.cancels,
    installIntoLibrary: install.installIntoLibrary,
    clawhub: install.clawhub,
    refreshCopies: deploy.refreshCopies,
    safety: deps.safety,
    removed: deps.removed,
  });
  const preview = createSourcePreview({
    store,
    git: install.git,
    download: install.download,
    clawhub: install.clawhub,
  });
  const { sourceNews } = deps;
  const sources = createSourceChecker(ctx, {
    store,
    git: install.git,
    install: install.installIntoLibrary,
    news: sourceNews,
    safety: deps.safety,
  });
  const origin = createOriginFinder(ctx, {
    store,
    git: install.git,
    searchMarket: deps.searchMarket,
  });
  const auto = createAutoUpdater(ctx, {
    skills: () => store.list(),
    checkAll: checker.checkAll,
    update: updater.update,
    checkSources: (known) => sources.check(undefined, known),
  });

  const api: UpdatesApi = {
    check: (skillId, force) => checker.check(skillId, { force }),
    checkAll: async (force, options) => {
      const checkedFrom = Date.now();
      const result = await checker.checkAll(force, {
        skillIds: options?.skillIds,
        dryRun: options?.dryRun,
      });
      if (!options?.newSkills || options.dryRun) return result;
      // The repositories of the skills checked, asked again only where the check failed.
      const chosen = options.skillIds ? new Set(options.skillIds) : null;
      const sourceKeys = chosen
        ? store
            .list()
            .flatMap((skill) => (chosen.has(skill.id) ? (repositoryKeyOf(skill) ?? []) : []))
        : undefined;
      return { ...result, sources: await sources.check(sourceKeys, checkedSince(checkedFrom)) };
    },
    update: (skillId, approval, options) =>
      updater.update(skillId, approval, {
        acceptRisk: options?.acceptRisk,
        expectedRevision: options?.expectedRevision,
        dryRun: options?.dryRun,
      }),
    updateMany: updater.updateMany,
    reimport: (skillId, approval, options) =>
      updater.reimport(skillId, approval, {
        acceptRisk: options?.acceptRisk,
        dryRun: options?.dryRun,
      }),
    relink: (skillId, sourcePath, approval, options) =>
      updater.relink(skillId, sourcePath, approval, { acceptRisk: options?.acceptRisk }),
    detach: updater.detach,
    compareSource: preview.compareSource,
    lastAutoRunAt: async () => auto.lastRunAt() || null,
    sourceNews: async () => sources.news(),
    checkSources: (sourceKeys) => sources.check(sourceKeys),
    dismissSourceNews: async (sourceKey, paths) => sourceNews.dismiss(sourceKey, paths),
    findSource: origin.find,
    lookUpSource: origin.lookUp,
    attachSource: origin.attach,
  };

  return { api, auto, origin };
}
