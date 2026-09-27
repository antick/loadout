import type { UpdatesApi } from "@loadout/shared";
import type { CoreContext } from "../context";
import type { DeployService } from "../deploy";
import type { InstallService } from "../install";
import type { SafetyGate } from "../install/safety-gate";
import type { RemovedStore } from "../storage/removed";
import type { SkillStore } from "../skills/store";
import { type AutoUpdater, createAutoUpdater } from "./auto";
import { createChecker } from "./check";
import { createSourcePreview } from "./preview";
import { createUpdater } from "./update";

export interface UpdatesServiceDeps {
  store: SkillStore;
  /** Same git client, cancel registry and way into the library the installer uses. */
  install: Pick<InstallService, "git" | "download" | "cancels" | "installIntoLibrary">;
  deploy: Pick<DeployService, "refreshCopies">;
  /** Checks every new version before it replaces the library copy. */
  safety?: SafetyGate;
  /** Keeps the edited version an approved update replaces. */
  removed?: Pick<RemovedStore, "keepCopy">;
}

export interface UpdatesService {
  api: UpdatesApi;
  /** Background rounds; the host starts and stops them. */
  auto: AutoUpdater;
}

export function createUpdatesService(ctx: CoreContext, deps: UpdatesServiceDeps): UpdatesService {
  const { store, install, deploy } = deps;
  const checker = createChecker(ctx, { store, git: install.git, download: install.download });
  const updater = createUpdater(ctx, {
    store,
    git: install.git,
    download: install.download,
    cancels: install.cancels,
    installIntoLibrary: install.installIntoLibrary,
    refreshCopies: deploy.refreshCopies,
    safety: deps.safety,
    removed: deps.removed,
  });
  const preview = createSourcePreview({ store, git: install.git, download: install.download });
  const auto = createAutoUpdater(ctx, {
    skills: () => store.list(),
    check: checker.check,
    update: updater.update,
  });

  const api: UpdatesApi = {
    check: (skillId, force) => checker.check(skillId, { force }),
    checkAll: checker.checkAll,
    update: (skillId, approval, options) =>
      updater.update(skillId, approval, {
        acceptRisk: options?.acceptRisk,
        expectedRevision: options?.expectedRevision,
      }),
    updateMany: updater.updateMany,
    reimport: (skillId, approval, options) =>
      updater.reimport(skillId, approval, { acceptRisk: options?.acceptRisk }),
    relink: (skillId, sourcePath, approval, options) =>
      updater.relink(skillId, sourcePath, approval, { acceptRisk: options?.acceptRisk }),
    detach: updater.detach,
    sourceDocument: preview.sourceDocument,
    sourceDiff: preview.sourceDiff,
  };

  return { api, auto };
}
