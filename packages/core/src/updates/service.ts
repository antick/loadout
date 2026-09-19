import type { UpdatesApi } from "@skillboard/shared";
import type { CoreContext } from "../context";
import type { DeployService } from "../deploy";
import type { InstallService } from "../install";
import type { SkillStore } from "../skills/store";
import { type AutoUpdater, createAutoUpdater } from "./auto";
import { createChecker } from "./check";
import { createSourcePreview } from "./preview";
import { createUpdater } from "./update";

export interface UpdatesServiceDeps {
  store: SkillStore;
  /** Same git client, cancel registry and way into the library the installer uses. */
  install: Pick<InstallService, "git" | "cancels" | "installIntoLibrary">;
  deploy: Pick<DeployService, "refreshCopies">;
}

export interface UpdatesService {
  api: UpdatesApi;
  /** Background rounds; the host starts and stops them. */
  auto: AutoUpdater;
}

export function createUpdatesService(ctx: CoreContext, deps: UpdatesServiceDeps): UpdatesService {
  const { store, install, deploy } = deps;
  const checker = createChecker(ctx, { store, git: install.git });
  const updater = createUpdater(ctx, {
    store,
    git: install.git,
    cancels: install.cancels,
    installIntoLibrary: install.installIntoLibrary,
    refreshCopies: deploy.refreshCopies,
  });
  const preview = createSourcePreview({ store, git: install.git });
  const auto = createAutoUpdater(ctx, {
    skills: () => store.list(),
    check: checker.check,
    update: updater.update,
  });

  const api: UpdatesApi = {
    check: (skillId, force) => checker.check(skillId, { force }),
    checkAll: checker.checkAll,
    update: (skillId, approval) => updater.update(skillId, approval),
    updateMany: updater.updateMany,
    reimport: updater.reimport,
    relink: updater.relink,
    detach: updater.detach,
    sourceDocument: preview.sourceDocument,
    sourceDiff: preview.sourceDiff,
  };

  return { api, auto };
}
