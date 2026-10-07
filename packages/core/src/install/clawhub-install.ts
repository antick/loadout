import { readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  CLAWHUB_NAME,
  type InstallOptions,
  type PreviewedSkill,
  type Skill,
  clawhubMarketId,
  clawhubSkillUrl,
} from "@loadout/shared";
import type { CoreContext } from "../context";
import { cancelled, notFound } from "../errors";
import { CLAWHUB_META_FILES, type ClawhubClient, parseClawhubRef } from "../market/clawhub";
import type { SkillStore } from "../skills/store";
import { archiveSkillDir, unpackArchive } from "./archive";
import { type CancelRegistry, type Task, withTask } from "./cancel";
import type { InstallIntoLibrary } from "./library";
import { emitProgress } from "./preview-sessions";
import { type ReplaceDeps, installOver } from "./replace";
import { readCheckedSkill } from "./read-skill";
import { type SafetyGate, installChecked } from "./safety-gate";

export interface ClawhubInstallerDeps {
  store: SkillStore;
  clawhub: ClawhubClient;
  cancels: CancelRegistry;
  install: InstallIntoLibrary;
  safety: SafetyGate;
  /** Recently removed and deployed copies, for installing a skill that is already there. */
  replace: ReplaceDeps;
}

/** A ClawHub download, unpacked, with the registry's own files taken out. Always call `cleanup`. */
export async function openClawhubVersion(
  clawhub: ClawhubClient,
  owner: string,
  slug: string,
  version: string,
  signal?: AbortSignal,
): Promise<{ dir: string; cleanup(): Promise<void> }> {
  const data = await clawhub.download(owner, slug, version, signal);
  const archive = await unpackArchive(data, `${slug}-${version}.zip`);
  try {
    for (const name of readdirSync(archive.root)) {
      if (CLAWHUB_META_FILES.has(name)) rmSync(join(archive.root, name), { force: true });
    }
    return { dir: archiveSkillDir(archive.root), cleanup: archive.cleanup };
  } catch (error) {
    await archive.cleanup();
    throw error;
  }
}

/** The latest version of a ClawHub skill, unpacked for the task that opened it. */
interface LatestClawhub {
  key: string;
  owner: string;
  slug: string;
  version: string;
  dir: string;
}

/**
 * Run `use` on the latest version of a ClawHub skill, as a task under the skill's progress and
 * cancel key. The download is deleted when the task ends.
 */
async function withLatestClawhub<T>(
  ctx: CoreContext,
  deps: ClawhubInstallerDeps,
  ownerInput: string,
  slugInput: string,
  use: (latest: LatestClawhub) => Promise<T>,
  doneName?: (result: T) => string,
): Promise<T> {
  const { owner, slug } = parseClawhubRef(`${ownerInput.trim()}/${slugInput.trim()}`);
  const key = clawhubMarketId(owner, slug);
  const open = async ({ signal, keep }: Task): Promise<T> => {
    emitProgress(ctx, key, "downloading", { name: slug });
    const found = await deps.clawhub.detail(owner, slug);
    const version = found.version;
    if (!version) throw notFound(`${owner}/${slug} has no published version on ${CLAWHUB_NAME}`);
    const opened = await openClawhubVersion(deps.clawhub, found.owner, found.slug, version, signal);
    keep(opened.cleanup);
    if (signal.aborted) throw cancelled();
    return use({ key, owner: found.owner, slug: found.slug, version, dir: opened.dir });
  };
  return withTask(ctx, deps.cancels, key, open, doneName);
}

/** Read a ClawHub skill at its latest version without installing it (`skills use`). */
export function createClawhubReader(ctx: CoreContext, deps: ClawhubInstallerDeps) {
  return (owner: string, slug: string, options: InstallOptions = {}): Promise<PreviewedSkill> =>
    withLatestClawhub(ctx, deps, owner, slug, (latest) =>
      readCheckedSkill(
        deps.safety,
        { name: latest.slug, dir: latest.dir },
        { ...options, progressKey: latest.key },
      ),
    );
}

/** Install a skill from the ClawHub registry at its latest version. */
export function createClawhubInstaller(ctx: CoreContext, deps: ClawhubInstallerDeps) {
  return (owner: string, slug: string, options: InstallOptions = {}): Promise<Skill> =>
    withLatestClawhub(
      ctx,
      deps,
      owner,
      slug,
      (latest) => {
        emitProgress(ctx, latest.key, "installing", { name: latest.slug });
        const ref = `${latest.owner}/${latest.slug}`;
        // Installing what is already installed refreshes it instead of adding `<slug>-2`.
        const installed = deps.store.findBySource("clawhub", ref);
        return installChecked(
          installOver(ctx, deps.install, deps.replace, installed),
          deps.safety,
          {
            sourceDir: latest.dir,
            name: latest.slug,
            record: {
              sourceType: "clawhub",
              sourceRef: ref,
              sourceUrl: clawhubSkillUrl(latest.owner, latest.slug),
              sourceSubpath: null,
              sourceBranch: null,
              sourceRevision: latest.version,
              remoteRevision: latest.version,
              updateStatus: "up_to_date",
            },
          },
          { ...options, progressKey: latest.key },
        );
      },
      (skill) => skill.name,
    );
}
