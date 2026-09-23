/**
 * DEV ONLY. `instructions.*` for the browser preview, plus `editor.*` for instruction-file
 * locations (other locations fall through to the editor mock). Agents that read the same file
 * share one entry, as in the app.
 */
import {
  AGENT_INSTRUCTION_FILES,
  type AgentInfo,
  type EditTarget,
  type ErrorCode,
  type InstructionFile,
  type Project,
  type SaveSkillFileInput,
  type SaveSkillFileResult,
  type SkillFile,
  type SkillFileEntry,
  type SkillLocation,
} from "@loadout/shared";

type Handler = (...args: never[]) => unknown;

export interface InstructionsMockContext {
  home: string;
  getAgents(): AgentInfo[];
  getProjects(): Project[];
  fail(code: ErrorCode, message: string): never;
}

type InstructionLocation = Extract<SkillLocation, { kind: "instructions" }>;

/** Files the preview starts with, by absolute path. */
function seedFiles(home: string, projects: Project[]): Map<string, string> {
  const shop = projects[0]?.path ?? `${home}/code/shop-web`;
  return new Map([
    [`${home}/.claude/CLAUDE.md`, "# Global rules\n\n- Answer the question first.\n"],
    [`${shop}/AGENTS.md`, "# shop-web\n\nRun `pnpm test` before committing.\n"],
  ]);
}

const isInstructions = (location: SkillLocation): location is InstructionLocation =>
  location.kind === "instructions";

function hashOf(content: string): string {
  return `mock-${content.length}-${[...content].reduce((sum, ch) => sum + ch.charCodeAt(0), 0)}`;
}

/** Wrap the editor mock so instruction-file locations are answered here. */
export function withInstructionMocks(
  ctx: InstructionsMockContext,
  editor: Record<string, Handler>,
): Record<string, Handler> {
  const files = seedFiles(ctx.home, ctx.getProjects());

  function rootOf(projectId: string | null): string {
    if (projectId === null) return ctx.home;
    const project = ctx.getProjects().find((entry) => entry.id === projectId);
    return project?.path ?? ctx.fail("NOT_FOUND", `Project not found: ${projectId}`);
  }

  function list(projectId: string | null): InstructionFile[] {
    const scope = projectId === null ? "global" : "project";
    const groups = new Map<string, InstructionFile>();
    for (const agent of ctx.getAgents()) {
      const relative = AGENT_INSTRUCTION_FILES[agent.key]?.[scope];
      if (!relative || !agent.installed || !agent.enabled) continue;
      const path = `${rootOf(projectId)}/${relative}`;
      const reader = { agentKey: agent.key, agentName: agent.displayName };
      const known = groups.get(path);
      if (known) {
        known.readers.push(reader);
        continue;
      }
      const content = files.get(path);
      groups.set(path, {
        scope,
        projectId,
        path,
        name: relative.split("/").pop() ?? relative,
        exists: content !== undefined,
        linkTarget: null,
        size: content?.length ?? null,
        modifiedAt: content === undefined ? null : Date.now(),
        readers: [reader],
      });
    }
    return [...groups.values()];
  }

  function find(location: InstructionLocation): InstructionFile {
    const found = list(location.projectId).find((file) =>
      file.readers.some((reader) => reader.agentKey === location.agentKey),
    );
    return found ?? ctx.fail("NOT_FOUND", "This agent has no instruction file here");
  }

  function read(location: InstructionLocation): { file: InstructionFile; skillFile: SkillFile } {
    const file = find(location);
    const content = files.get(file.path);
    if (content === undefined) ctx.fail("NOT_FOUND", `${file.path} does not exist yet`);
    return {
      file,
      skillFile: {
        path: file.name,
        content,
        hash: hashOf(content),
        eol: "lf",
        modifiedAt: Date.now(),
      },
    };
  }

  const route =
    (name: string, own: (location: InstructionLocation, ...rest: never[]) => unknown): Handler =>
    (...args: never[]) => {
      const [location, ...rest] = args as unknown as [SkillLocation, ...never[]];
      return isInstructions(location) ? own(location, ...rest) : editor[name]?.(...args);
    };

  return {
    ...editor,
    "instructions.list": (projectId: string | null) => list(projectId ?? null),
    "instructions.create": (location: InstructionLocation) => {
      const file = find(location);
      if (!file.exists) files.set(file.path, "");
      return find(location);
    },
    "editor.target": route("editor.target", (location): EditTarget => {
      const { file } = read(location);
      return {
        location,
        name: file.name,
        folderName: file.name,
        path: file.path,
        placeLabel: file.readers.map((reader) => reader.agentName).join(", "),
        librarySkillId: null,
        otherCopies: [],
      };
    }),
    "editor.files": route("editor.files", (location): SkillFileEntry[] => {
      const { skillFile } = read(location);
      return [
        {
          path: skillFile.path,
          size: skillFile.content.length,
          locked: null,
          main: true,
          edited: false,
        },
      ];
    }),
    "editor.readFile": route("editor.readFile", (location) => read(location).skillFile),
    "editor.saveFile": route(
      "editor.saveFile",
      (location, input: SaveSkillFileInput): SaveSkillFileResult => {
        const { file, skillFile } = read(location);
        if (skillFile.hash !== input.baseHash && !input.overwrite) {
          ctx.fail("CHANGED_ON_DISK", `${input.path} changed on disk after you opened it.`);
        }
        files.set(file.path, input.content);
        return {
          skill: null,
          file: read(location).skillFile,
          written: skillFile.content !== input.content,
          copiesRefreshed: 0,
          copiesKept: [],
          otherCopiesSaved: [],
          otherCopiesSkipped: [],
        };
      },
    ),
    "editor.fileVersions": route("editor.fileVersions", () => []),
  };
}
