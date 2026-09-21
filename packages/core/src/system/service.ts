import { arch, platform, release } from "node:os";
import type { DiagnosticInfo, SystemApi } from "@loadout/shared";
import type { AgentRegistry } from "../agents/registry";
import type { CoreContext } from "../context";
import type { DeployService } from "../deploy";
import type { InstallService } from "../install";
import { describeLocation, setLibraryPath } from "../paths";
import type { SkillStore } from "../skills/store";
import { createAgentControl } from "./agent-control";
import { type CliPublisher, createCliPublisher } from "./cli-publish";
import { clearCrashMarker, readCrashMarker } from "./crash";
import { exportLogs, readLogExcerpt } from "./logs";

export interface SystemServiceDeps {
  store: SkillStore;
  install: Pick<InstallService, "git" | "installIntoLibrary">;
  deploy: Pick<DeployService, "api">;
  registry: AgentRegistry;
}

export interface SystemService {
  api: SystemApi;
  /** Copy the bundled command-line tool where agents can find it. The host calls this on start. */
  publishCli: CliPublisher["publish"];
}

export function createSystemService(ctx: CoreContext, deps: SystemServiceDeps): SystemService {
  const cli = createCliPublisher(ctx);
  const agentControl = createAgentControl(ctx, deps);

  async function diagnostics(): Promise<DiagnosticInfo> {
    const location = describeLocation(ctx.paths, ctx.warnings);
    // A missing git is an answer ("not installed"), never a reason for diagnostics to fail.
    const gitVersion = await deps.install.git.gitVersion().catch(() => null);
    return {
      appVersion: ctx.host.appVersion,
      os: platform(),
      osVersion: release(),
      arch: arch(),
      libraryPath: location.path,
      libraryPathOverridden: location.overridden,
      gitVersion,
    };
  }

  const api: SystemApi = {
    libraryLocation: async () => describeLocation(ctx.paths, ctx.warnings),
    setLibraryPath: async (path) => {
      setLibraryPath(ctx.paths, path);
      ctx.touched("settings");
      return describeLocation(ctx.paths, ctx.warnings);
    },
    revealLibrary: () => ctx.host.revealPath(ctx.paths.skillsDir),
    activity: async (limit) => ctx.activity.list(limit),
    diagnostics,
    logExcerpt: async () => readLogExcerpt(ctx),
    exportLogs: async () => exportLogs(ctx, await diagnostics()),
    lastCrash: async () => readCrashMarker(ctx.paths.crashMarkerPath, ctx.homeDir),
    clearLastCrash: async () => clearCrashMarker(ctx.paths.crashMarkerPath),
    cliStatus: async () => cli.status(),
    agentControlStatus: async () => agentControl.status(),
    setupAgentControl: agentControl.setup,
    dismissAgentControl: async () => agentControl.dismiss(),
  };

  return { api, publishCli: cli.publish };
}
