import { mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type InstallApi,
  PRESET_FILE_MAX_BYTES,
  type PresetExportOptions,
  type PresetExportResult,
  type PresetFile,
  type PresetFileSkill,
  type PresetImportOptions,
  type PresetImportPlan,
  type PresetImportResult,
  type PresetImportSkill,
  type PresetsApi,
  type Skill,
  formatBytes,
  normalizeSourceUrl,
  repositoryLabel,
} from "@loadout/shared";
import type { AgentRegistry } from "../agents/registry";
import type { CoreContext } from "../context";
import { errorMessage, invalid, isAppError } from "../errors";
import type { Download } from "../install/download";
import type { InstallIntoLibrary } from "../install/library";
import { type SafetyGate, installChecked } from "../install/safety-gate";
import type { SkillStore } from "../skills/store";
import { isInside, normalizeAbsolutePath, writeFileAtomic } from "../util/fs";
import { buildPresetFile, parsePresetFile, remoteSourceOf, writeEmbeddedSkill } from "./share-file";
import type { PresetStore } from "./store";

export type PresetSharingApi = Pick<PresetsApi, "exportFile" | "previewImport" | "importFile">;

export interface PresetSharingDeps {
  store: SkillStore;
  presets: PresetStore;
  api: Omit<PresetsApi, keyof PresetSharingApi>;
  registry: AgentRegistry;
  install: Pick<InstallApi, "previewGit" | "confirmGit" | "cancelPreview">;
  installIntoLibrary: InstallIntoLibrary;
  download: Download;
  safety?: SafetyGate;
}

const WEB_LINK = /^https?:\/\//i;
const DRAFT_DIR_PREFIX = "loadout-preset-";

const sourceKey = (url: string, subpath: string | null | undefined): string =>
  `${normalizeSourceUrl(url)}\u0000${(subpath ?? "").replace(/^\/+|\/+$/g, "")}`;

/** "Name", or "Name 2", "Name 3"… when a preset holds it already. */
function freeName(wanted: string, taken: ReadonlySet<string>): string {
  const lower = new Set([...taken].map((name) => name.toLowerCase()));
  if (!lower.has(wanted.toLowerCase())) return wanted;
  for (let number = 2; ; number += 1) {
    const candidate = `${wanted} ${number}`;
    if (!lower.has(candidate.toLowerCase())) return candidate;
  }
}

/**
 * Presets as files to share: export one with its skills' sources (and files, for skills without
 * one), and import one, installing what the library lacks through the usual installers.
 */
export function createPresetSharing(ctx: CoreContext, deps: PresetSharingDeps): PresetSharingApi {
  const { store } = deps;

  async function readInput(input: string): Promise<string> {
    const trimmed = input.trim();
    if (WEB_LINK.test(trimmed)) {
      const data = await deps.download(trimmed, { maxBytes: PRESET_FILE_MAX_BYTES });
      return data.toString("utf8");
    }
    const path = normalizeAbsolutePath(trimmed, "Preset file");
    const info = await stat(path).catch(() => null);
    if (!info?.isFile()) throw invalid(`There is no file at ${path}.`);
    if (info.size > PRESET_FILE_MAX_BYTES) {
      throw invalid(`The file is larger than ${formatBytes(PRESET_FILE_MAX_BYTES)}.`);
    }
    return readFile(path, "utf8");
  }

  /** The library skill a file entry stands for: same source first, then same name. */
  function libraryMatch(entry: PresetFileSkill, skills: readonly Skill[]): Skill | null {
    if (entry.source) {
      const wanted = sourceKey(entry.source.url, entry.source.subpath);
      const bySource = skills.find((skill) => {
        const source = remoteSourceOf(skill);
        return source !== null && sourceKey(source.url, source.subpath) === wanted;
      });
      if (bySource) return bySource;
    }
    const name = entry.name.toLowerCase();
    return (
      skills.find(
        (skill) => skill.name.toLowerCase() === name || skill.dirName.toLowerCase() === name,
      ) ?? null
    );
  }

  function planOf(file: PresetFile): PresetImportPlan {
    const skills = store.list();
    const entries = file.skills.map((entry): PresetImportSkill => {
      const found = libraryMatch(entry, skills);
      const base = { name: entry.name, description: entry.description ?? null };
      if (found) return { ...base, state: "library", librarySkillId: found.id, from: null };
      if (entry.source) {
        return {
          ...base,
          state: "source",
          librarySkillId: null,
          from: repositoryLabel(entry.source.url),
        };
      }
      return {
        ...base,
        state: entry.files ? "files" : "missing",
        librarySkillId: null,
        from: null,
      };
    });
    const taken = deps.presets
      .list()
      .some((preset) => preset.name.toLowerCase() === file.name.toLowerCase());
    return {
      name: file.name,
      description: file.description,
      icon: file.icon,
      nameTaken: taken,
      skills: entries,
    };
  }

  /** Install the file's skills from one repository or link, in one preview. */
  async function installFromSource(
    url: string,
    branch: string | null,
    entries: readonly PresetFileSkill[],
    options: PresetImportOptions,
    result: { ids: Map<PresetFileSkill, string>; failed: PresetImportResult["failed"] },
  ): Promise<void> {
    const preview = await deps.install.previewGit(branch ? `${url}#${branch}` : url);
    try {
      const picks = entries.flatMap((entry) => {
        const subpath = entry.source?.subpath ?? "";
        const found =
          preview.skills.find((skill) => skill.relPath === subpath) ??
          preview.skills.find((skill) => skill.name.toLowerCase() === entry.name.toLowerCase());
        if (!found) {
          result.failed.push({
            name: entry.name,
            message: `Not found in ${repositoryLabel(url)}.`,
          });
          return [];
        }
        return [{ entry, relPath: found.relPath, name: found.name }];
      });
      if (picks.length === 0) return;
      const installed = await deps.install.confirmGit(
        preview.previewId,
        picks.map(({ relPath, name }) => ({ relPath, name })),
        { acceptRisk: options.acceptRisk },
      );
      for (const [index, pick] of picks.entries()) {
        const skill = installed[index];
        if (skill) result.ids.set(pick.entry, skill.id);
      }
    } finally {
      await deps.install.cancelPreview(preview.previewId).catch(() => undefined);
    }
  }

  async function installFromFiles(
    entry: PresetFileSkill,
    options: PresetImportOptions,
  ): Promise<Skill> {
    const parent = await mkdtemp(join(tmpdir(), DRAFT_DIR_PREFIX));
    try {
      const dir = join(parent, "skill");
      await mkdir(dir);
      writeEmbeddedSkill(dir, entry.files ?? {});
      return await installChecked(
        deps.installIntoLibrary,
        deps.safety,
        {
          sourceDir: dir,
          name: entry.name,
          record: { sourceType: "import", sourceRef: null, updateStatus: "local_only" },
        },
        options,
      );
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  }

  return {
    exportFile: async (
      id,
      destPath,
      options: PresetExportOptions = {},
    ): Promise<PresetExportResult> => {
      const preset = deps.presets.get(id);
      const path = normalizeAbsolutePath(destPath, "Export path");
      if (isInside(ctx.paths.skillsDir, path))
        throw invalid("Export somewhere outside the skill library");
      const skills = preset.skillIds.map((skillId) => store.get(skillId));
      const built = buildPresetFile(
        preset,
        skills,
        (skillId) => [...deps.presets.disabledAgents(id, skillId)].sort(),
        options.includeFiles !== false,
      );
      writeFileAtomic(path, `${JSON.stringify(built.file, null, 2)}\n`);
      return { path, skills: skills.length, embedded: built.embedded, nameOnly: built.nameOnly };
    },

    previewImport: async (input) => planOf(parsePresetFile(await readInput(input))),

    importFile: async (input, options: PresetImportOptions = {}): Promise<PresetImportResult> => {
      const file = parsePresetFile(await readInput(input));
      const plan = planOf(file);
      const ids = new Map<PresetFileSkill, string>();
      const failed: PresetImportResult["failed"] = [];
      const installed: string[] = [];
      const reused: string[] = [];

      const bySource = new Map<string, PresetFileSkill[]>();
      for (const [index, entry] of file.skills.entries()) {
        const step = plan.skills[index];
        if (step?.state === "library" && step.librarySkillId) {
          ids.set(entry, step.librarySkillId);
          reused.push(entry.name);
        } else if (step?.state === "source" && entry.source) {
          const key = `${entry.source.url}\u0000${entry.source.branch ?? ""}`;
          bySource.set(key, [...(bySource.get(key) ?? []), entry]);
        } else if (step?.state === "missing") {
          failed.push({
            name: entry.name,
            message: "No source to install it from, and the file does not hold it.",
          });
        }
      }

      // A flagged skill stops the import so the user can read the report; what went in stays,
      // and importing again picks up from there.
      for (const group of bySource.values()) {
        const source = group[0]?.source;
        if (!source) continue;
        const before = ids.size;
        try {
          await installFromSource(source.url, source.branch ?? null, group, options, {
            ids,
            failed,
          });
        } catch (error) {
          if (isAppError(error, "UNSAFE")) throw error;
          for (const entry of group)
            failed.push({ name: entry.name, message: errorMessage(error) });
        }
        if (ids.size > before)
          installed.push(...group.filter((entry) => ids.has(entry)).map((entry) => entry.name));
      }
      for (const entry of file.skills) {
        if (
          !entry.files ||
          ids.has(entry) ||
          plan.skills[file.skills.indexOf(entry)]?.state !== "files"
        )
          continue;
        try {
          ids.set(entry, (await installFromFiles(entry, options)).id);
          installed.push(entry.name);
        } catch (error) {
          if (isAppError(error, "UNSAFE")) throw error;
          failed.push({ name: entry.name, message: errorMessage(error) });
        }
      }

      const names = new Set(deps.presets.list().map((preset) => preset.name));
      const preset = await deps.api.create({
        name: freeName(options.name?.trim() || file.name, names),
        description: file.description,
        icon: file.icon,
      });
      const skillIds = [...new Set(file.skills.flatMap((entry) => ids.get(entry) ?? []))];
      if (skillIds.length > 0) await deps.api.addSkills(preset.id, skillIds);
      const known = new Set(deps.registry.list().map((agent) => agent.key));
      for (const entry of file.skills) {
        const skillId = ids.get(entry);
        for (const agentKey of entry.offFor ?? []) {
          if (skillId && known.has(agentKey))
            deps.presets.setToggle(preset.id, skillId, agentKey, false);
        }
      }
      ctx.touched("presets", "skills");
      return { preset: deps.presets.get(preset.id), installed, reused, failed };
    },
  };
}
