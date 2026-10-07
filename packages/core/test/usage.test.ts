import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { claudeCodeReader, codexReader } from "../src/usage/parse";
import { readMarkedLines } from "../src/usage/log-files";
import { type UsageService, createUsageService } from "../src/usage";
import { type TestWorld, createTestWorld, makeSkill } from "./helpers";
import { createInstallHarness } from "./install-fixtures";

const NOW = Date.UTC(2026, 8, 28, 12);
const DAY = 24 * 60 * 60 * 1000;
const iso = (ms: number): string => new Date(ms).toISOString();

/** A Claude Code assistant record calling the Skill tool. */
function claudeSkillCall(skill: string, at: number, id: string, cwd = "/work/shop"): string {
  return JSON.stringify({
    type: "assistant",
    uuid: `u-${id}`,
    timestamp: iso(at),
    cwd,
    message: {
      role: "assistant",
      content: [
        { type: "text", text: "Loading it." },
        { type: "tool_use", id, name: "Skill", input: { skill, args: "x" } },
      ],
    },
  });
}

/** A Claude Code user record: the person typed `/name`. */
function claudeCommand(name: string, at: number, uuid: string): string {
  return JSON.stringify({
    type: "user",
    uuid,
    timestamp: iso(at),
    cwd: "/work/docs",
    message: {
      role: "user",
      content: `<command-name>/${name}</command-name>\n<command-args></command-args>`,
    },
  });
}

const codexMeta = (cwd: string): string =>
  JSON.stringify({
    type: "session_meta",
    timestamp: iso(NOW),
    payload: {
      cwd,
      base_instructions: { text: "Skills live in ~/.codex/skills/pdf/SKILL.md and others." },
    },
  });

function codexShell(command: string, at: number, callId: string, name = "exec_command"): string {
  return JSON.stringify({
    type: "response_item",
    timestamp: iso(at),
    payload: {
      type: "function_call",
      name,
      call_id: callId,
      arguments: JSON.stringify({ command, workdir: "/work/api" }),
    },
  });
}

describe("reading Claude Code logs", () => {
  it("counts Skill tool calls and skills typed as commands, not plugin skills", () => {
    const state = { projectPath: null };
    expect(claudeCodeReader.parse(claudeSkillCall("code-review", NOW, "t1"), state)).toEqual([
      { eventId: "t1", name: "code-review", usedAt: NOW, projectPath: "/work/shop" },
    ]);
    expect(claudeCodeReader.parse(claudeCommand("grilling", NOW, "u9"), state)).toEqual([
      { eventId: "u9:grilling", name: "grilling", usedAt: NOW, projectPath: "/work/docs" },
    ]);
    expect(claudeCodeReader.parse(claudeSkillCall("design:frontend", NOW, "t2"), state)).toEqual(
      [],
    );
  });

  it("ignores command names inside tool results and broken lines", () => {
    const toolResult = JSON.stringify({
      type: "user",
      uuid: "u1",
      timestamp: iso(NOW),
      message: {
        role: "user",
        content: [{ type: "tool_result", content: "<command-name>/model</command-name>" }],
      },
    });
    const state = { projectPath: null };
    expect(claudeCodeReader.parse(toolResult, state)).toEqual([]);
    expect(claudeCodeReader.parse('{"type":"assistant", "name":"Skill"', state)).toEqual([]);
    expect(claudeCodeReader.parse(JSON.stringify({ type: "assistant" }), state)).toEqual([]);
  });
});

describe("reading Codex logs", () => {
  it("counts calls that open a SKILL.md, in the session's folder", () => {
    const state = { projectPath: null as string | null };
    expect(codexReader.parse(codexMeta("/work/api"), state)).toEqual([]);
    expect(state.projectPath).toBe("/work/api");
    const read = codexShell(
      "cat .agents/skills/pdf/SKILL.md && sed -n 1,40p ~/.codex/skills/graphify/SKILL.md; cat .agents/skills/pdf/SKILL.md",
      NOW,
      "c1",
    );
    expect(codexReader.parse(read, state)).toEqual([
      { eventId: "c1:pdf", name: "pdf", usedAt: NOW, projectPath: "/work/api" },
      { eventId: "c1:graphify", name: "graphify", usedAt: NOW, projectPath: "/work/api" },
    ]);
  });

  it("does not count writing a skill, a glob, or messages that mention one", () => {
    const state = { projectPath: null };
    expect(
      codexReader.parse(
        codexShell("*** Add File: skills/new/SKILL.md", NOW, "c2", "apply_patch"),
        state,
      ),
    ).toEqual([]);
    expect(codexReader.parse(codexShell("ls skills/*/SKILL.md", NOW, "c3"), state)).toEqual([]);
    const heredoc = "cat > ./.agents/skills/draft/SKILL.md <<'EOF'\nhi\nEOF";
    expect(codexReader.parse(codexShell(heredoc, NOW, "c4"), state)).toEqual([]);
    expect(
      codexReader.parse(codexShell("echo x | tee -a skills/draft/SKILL.md", NOW, "c5"), state),
    ).toEqual([]);
    const afterWrite = "date > out.txt; cat skills/pdf/SKILL.md";
    expect(codexReader.parse(codexShell(afterWrite, NOW, "c6"), state).map((e) => e.name)).toEqual([
      "pdf",
    ]);
    const audit = Array.from({ length: 9 }, (_, i) => `skills/s${i}/SKILL.md`).join(" ");
    expect(codexReader.parse(codexShell(`wc -l ${audit}`, NOW, "c7"), state)).toEqual([]);
    const message = JSON.stringify({
      type: "response_item",
      timestamp: iso(NOW),
      payload: { type: "message", role: "user", content: "see skills/pdf/SKILL.md" },
    });
    expect(codexReader.parse(message, state)).toEqual([]);
  });
});

describe("reading a log in parts", () => {
  let world: TestWorld;
  beforeEach(() => {
    world = createTestWorld();
  });
  afterEach(() => world.cleanup());

  it("hands over only marked whole lines and resumes after the last one", async () => {
    const path = join(world.root, "log.jsonl");
    const filler = "x".repeat(3 * 1024 * 1024);
    writeFileSync(path, `${filler}\nhit one\nplain\nhit two\npartial hit`);
    const seen: string[] = [];
    const readTo = await readMarkedLines(path, 0, ["hit"], (line) => seen.push(line));
    expect(seen).toEqual(["hit one", "hit two"]);
    appendFileSync(path, " done\nhit three\n");
    const again: string[] = [];
    const end = await readMarkedLines(path, readTo, ["hit"], (line) => again.push(line));
    expect(again).toEqual(["partial hit done", "hit three"]);
    expect(end).toBe(
      filler.length + "\nhit one\nplain\nhit two\npartial hit done\nhit three\n".length,
    );
  });
});

describe("usage service", () => {
  let world: TestWorld;
  let usage: UsageService;
  let claudeLog: string;
  let codexLog: string;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    world = createTestWorld();
    usage = createUsageService(world.ctx, { store: world.store });
    const claudeDir = join(world.home, ".claude", "projects", "-work-shop");
    const codexDir = join(world.home, ".codex", "sessions", "2026", "09", "20");
    mkdirSync(claudeDir, { recursive: true });
    mkdirSync(codexDir, { recursive: true });
    claudeLog = join(claudeDir, "s1.jsonl");
    codexLog = join(codexDir, "rollout-1.jsonl");
    writeFileSync(
      claudeLog,
      [
        claudeSkillCall("code-review", NOW - 2 * DAY, "t1"),
        claudeSkillCall("Code-Review", NOW - 40 * DAY, "t2", "/work/old"),
        claudeCommand("pdf", NOW - DAY, "u1"),
        claudeSkillCall("not-in-library", NOW, "t3"),
        "",
      ].join("\n"),
    );
    writeFileSync(
      codexLog,
      [
        codexMeta("/work/api"),
        codexShell("cat .agents/skills/pdf/SKILL.md", NOW - 3 * DAY, "c1"),
        "",
      ].join("\n"),
    );
    const install = createInstallHarness(world);
    for (const name of ["code-review", "pdf", "unused"]) {
      await install.api.fromPath(makeSkill(join(world.root, "src"), name));
    }
  });
  afterEach(() => {
    vi.useRealTimers();
    world.cleanup();
  });

  const idOf = (name: string): string => world.store.findByName(name)[0]!.id;

  it("reads nothing while tracking is off", async () => {
    expect(await usage.api.scan()).toMatchObject({ enabled: false, scannedAt: null, skills: [] });
  });

  it("counts runs per library skill, by agent and project", async () => {
    const report = await usage.api.setEnabled(true);
    expect(report).toMatchObject({ enabled: true, scannedAt: NOW });
    expect(report.logs.map((log) => [log.agentKey, log.found])).toEqual([
      ["claude_code", true],
      ["codex", true],
    ]);
    const byId = new Map(report.skills.map((skill) => [skill.skillId, skill]));
    expect(byId.get(idOf("code-review"))).toEqual({
      skillId: idOf("code-review"),
      uses: 2,
      recentUses: 1,
      lastUsedAt: NOW - 2 * DAY,
      byAgent: { claude_code: 2 },
      projects: ["/work/shop", "/work/old"],
    });
    expect(byId.get(idOf("pdf"))).toMatchObject({
      uses: 2,
      recentUses: 2,
      lastUsedAt: NOW - DAY,
      byAgent: { claude_code: 1, codex: 1 },
      projects: ["/work/docs", "/work/api"],
    });
    expect(byId.has(idOf("unused"))).toBe(false);
  });

  it("reads only what a log gained, and never counts a run twice", async () => {
    await usage.api.setEnabled(true);
    appendFileSync(codexLog, `${codexShell("cat skills/pdf/SKILL.md", NOW, "c2")}\n`);
    const pdf = (await usage.api.scan()).skills.find((skill) => skill.skillId === idOf("pdf"));
    expect(pdf).toMatchObject({ uses: 3, byAgent: { claude_code: 1, codex: 2 } });
    expect(pdf?.projects).toContain("/work/api");
    // A rewritten (shorter) log is read again from the top; its runs are already known.
    writeFileSync(claudeLog, `${claudeCommand("pdf", NOW - DAY, "u1")}\n`);
    const again = (await usage.api.scan()).skills.find((skill) => skill.skillId === idOf("pdf"));
    expect(again?.uses).toBe(3);
  });

  it("forgets everything when turned off", async () => {
    await usage.api.setEnabled(true);
    const off = await usage.api.setEnabled(false);
    expect(off).toMatchObject({ enabled: false, scannedAt: null, skills: [] });
    world.ctx.settings.set("usageTracking", true);
    expect((await usage.api.report()).skills).toEqual([]);
  });

  it("follows the agents' home folder variables", async () => {
    const elsewhere = join(world.root, "claude-home");
    world.ctx.env = () => ({ CLAUDE_CONFIG_DIR: elsewhere });
    const report = await usage.api.report();
    expect(report.logs[0]).toEqual({
      agentKey: "claude_code",
      path: join(elsewhere, "projects"),
      found: false,
    });

    // `~` as the agent reads it; a relative value is ignored, as the agent's folder ignores it.
    world.ctx.env = () => ({ CLAUDE_CONFIG_DIR: "~/claude-alt", CODEX_HOME: "relative/codex" });
    const logs = (await usage.api.report()).logs.map((entry) => entry.path);
    expect(logs).toEqual([
      join(world.ctx.homeDir, "claude-alt", "projects"),
      join(world.ctx.homeDir, ".codex", "sessions"),
    ]);
  });
});
