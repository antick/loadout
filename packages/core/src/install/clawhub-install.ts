import { readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  CLAWHUB_NAME,
  type InstallOptions,
  type PreviewedSkill,
  type Skill,
  clawhubSkillUrl,
} from "@loadout/shared";
import type { CoreContext } from "../context";
import { cancelled } from "../errors";
import { CLAWHUB_META_FILES, type ClawhubClient, parseClawhubRef } from "../market/clawhub";
import type { SkillStore } from "../skills/store";
import { archiveSkillDir, unpackArchive } from "./archive";
import { type CancelRegistry, withTask } from "./cancel";
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
  safety?: SafetyGate;
  /** Recently removed and deployed copies, for installing a skill that is already there. */
  replace?: ReplaceDeps;
}

/** Progress and cancel key of a ClawHub install, as the app names it. */
function clawhubTaskKey(owner: string, slug: string): string {
  return `clawhub:${owner}/${slug}`;
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

/** Read a ClawHub skill at its latest version without installing it (`skills use`). */
export function createClawhubReader(ctx: CoreContext, deps: ClawhubInstallerDeps) {
  return async function readClawhub(
    ownerInput: string,
    slugInput: string,
    options: InstallOptions = {},
  ): Promise<PreviewedSkill> {
    const { owner, slug } = parseClawhubRef(`${ownerInput.trim()}/${slugInput.trim()}`);
    const key = clawhubTaskKey(owner, slug);
    return withTask(ctx, deps.cancels, key, async ({ signal, keep }) => {
      emitProgress(ctx, key, "downloading", { name: slug });
      const found = await deps.clawhub.detail(owner, slug);
      if (!found.version)
        throw new Error(`${owner}/${slug} has no published version on ${CLAWHUB_NAME}`);
      const opened = await openClawhubVersion(
        deps.clawhub,
        found.owner,
        found.slug,
        found.version,
        signal,
      );
      keep(opened.cleanup);
      if (signal.aborted) throw cancelled();
      return readCheckedSkill(
        deps.safety,
        { name: found.slug, dir: opened.dir },
        { ...options, progressKey: key },
      );
    });
  };
}

/** Install a skill from the ClawHub registry at its latest version. */
export function createClawhubInstaller(ctx: CoreContext, deps: ClawhubInstallerDeps) {
  return async function fromClawhub(
    ownerInput: string,
    slugInput: string,
    options: InstallOptions = {},
  ): Promise<Skill> {
    const { owner, slug } = parseClawhubRef(`${ownerInput.trim()}/${slugInput.trim()}`);
    const key = clawhubTaskKey(owner, slug);
    return withTask(
      ctx,
      deps.cancels,
      key,
      async ({ signal, keep }) => {
        emitProgress(ctx, key, "downloading", { name: slug });
        const found = await deps.clawhub.detail(owner, slug);
        if (!found.version)
          throw new Error(`${owner}/${slug} has no published version on ${CLAWHUB_NAME}`);
        const opened = await openClawhubVersion(
          deps.clawhub,
          found.owner,
          found.slug,
          found.version,
          signal,
        );
        keep(opened.cleanup);
        if (signal.aborted) throw cancelled();
        emitProgress(ctx, key, "installing", { name: slug });
        const ref = `${found.owner}/${found.slug}`;
        // Installing what is already installed refreshes it instead of adding `<slug>-2`.
        const installed = deps.store.findBySource("clawhub", ref);
        return installChecked(
          installOver(ctx, deps.install, deps.replace, installed),
          deps.safety,
          {
            sourceDir: opened.dir,
            name: found.slug,
            record: {
              sourceType: "clawhub",
              sourceRef: ref,
              sourceUrl: clawhubSkillUrl(found.owner, found.slug),
              sourceSubpath: null,
              sourceBranch: null,
              sourceRevision: found.version,
              remoteRevision: found.version,
              updateStatus: "up_to_date",
            },
          },
          { ...options, progressKey: key },
        );
      },
      (skill) => skill.name,
    );
  };
}
