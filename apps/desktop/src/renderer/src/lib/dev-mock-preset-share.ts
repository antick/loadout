/**
 * DEV ONLY. Preset export and import for the browser preview: exporting pretends to write the
 * file; any file or link imports a small "Web kit" preset of two library skills and one new one.
 */
import type { PresetImportPlan, PresetImportResult } from "@loadout/shared";
import { type MockHandlers, callMock } from "@/lib/dev-mock-types";

const READ_MS = 500;
const IMPORTED_NAME = "Web kit";
const NEW_SKILL = "pdf-tools";

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export function createPresetShareMockHandlers(home: string, handlers: MockHandlers): MockHandlers {
  async function plan(): Promise<PresetImportPlan> {
    await wait(READ_MS);
    const skills = await callMock(handlers, "skills.list");
    const presets = await callMock(handlers, "presets.list");
    return {
      name: IMPORTED_NAME,
      description: "Frontend skills the team shares.",
      icon: null,
      nameTaken: presets.some((preset) => preset.name === IMPORTED_NAME),
      skills: [
        ...skills.slice(0, 2).map((skill) => ({
          name: skill.name,
          description: skill.description,
          state: "library" as const,
          librarySkillId: skill.id,
          from: null,
        })),
        {
          name: NEW_SKILL,
          description: "Fill, merge and split PDF files.",
          state: "source" as const,
          librarySkillId: null,
          from: "anthropics/skills",
        },
        {
          name: "team-notes",
          description: null,
          state: "missing" as const,
          librarySkillId: null,
          from: null,
        },
      ],
    };
  }

  return {
    "app.pickFile": () => `${home}/Downloads/web-kit.loadout-preset.json`,
    "presets.exportFile": async (id: string, path: string) => {
      const presets = await callMock(handlers, "presets.list");
      const preset = presets.find((entry) => entry.id === id);
      return { path, skills: preset?.skillIds.length ?? 0, embedded: 1, nameOnly: [] };
    },
    "presets.previewImport": () => plan(),
    "presets.importFile": async (_input: string, options: { name?: string } = {}) => {
      const found = await plan();
      const presets = await callMock(handlers, "presets.list");
      const names = new Set(presets.map((preset) => preset.name));
      let name = options.name?.trim() || found.name;
      for (let number = 2; names.has(name); number += 1) name = `${found.name} ${number}`;
      const preset = await callMock(handlers, "presets.create", {
        name,
        description: found.description,
      });
      const reused = found.skills.filter((skill) => skill.librarySkillId);
      const reusedIds = reused.flatMap((skill) => skill.librarySkillId ?? []);
      await callMock(handlers, "presets.addSkills", preset.id, reusedIds);
      const result: PresetImportResult = {
        preset: { ...preset, skillIds: reusedIds },
        installed: [],
        reused: reused.map((skill) => skill.name),
        failed: [
          { name: NEW_SKILL, message: "The preview cannot reach GitHub." },
          {
            name: "team-notes",
            message: "No source to install it from, and the file does not hold it.",
          },
        ],
      };
      return result;
    },
  };
}
