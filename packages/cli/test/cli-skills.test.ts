import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EXIT_FAILED, EXIT_OK, EXIT_USAGE } from "../src/run";
import { type Run, type Sandbox, createSandbox, writeSkill } from "./harness";

/** `skills create` and `skills scan`, and the safety check on `skills install`. */

let sandbox: Sandbox;
const cli = (...argv: string[]): Promise<Run> => sandbox.cli(...argv);

beforeEach(() => {
  sandbox = createSandbox();
});

afterEach(() => sandbox.cleanup());

describe("skills create", () => {
  it("writes a new skill and refuses a bad or taken name", async () => {
    const run = await cli(
      "skills",
      "create",
      "release-notes",
      "--description",
      "Draft notes.",
      "--json",
    );
    expect(run.code).toBe(EXIT_OK);
    const skill = run.json() as { name: string; libraryPath: string };
    expect(skill.name).toBe("release-notes");
    expect(readFileSync(join(skill.libraryPath, "SKILL.md"), "utf8")).toContain(
      "description: Draft notes.",
    );

    const taken = await cli("skills", "create", "release-notes", "--description", "x", "--json");
    expect(taken.code).toBe(EXIT_FAILED);
    expect(taken.json()).toMatchObject({ ok: false, code: "ALREADY_EXISTS" });
    const bad = await cli("skills", "create", "Release Notes", "--description", "x", "--json");
    expect(bad.json()).toMatchObject({ ok: false, code: "INVALID_INPUT" });
    expect((await cli("skills", "create", "notes", "--json")).code).toBe(EXIT_USAGE);
  });
});

/** Prints a flagged report for a skill whose SKILL.md says EVIL, a clean one otherwise. */
function fakeScanner(dir: string): string {
  const flagged = JSON.stringify({
    risk_assessment: { score: 90, recommendation: "DO_NOT_INSTALL", max_issue_severity: "HIGH" },
    issues: [
      {
        id: "P1",
        category: "Prompt Injection",
        pattern: "Instruction Override",
        severity: "HIGH",
        confidence: 0.8,
        location: { file: "SKILL.md", start_line: 6 },
        finding: "EVIL",
      },
    ],
    metadata: { skillspector_version: "9.9.9" },
  });
  const clean = JSON.stringify({
    risk_assessment: { score: 0, recommendation: "SAFE" },
    issues: [],
  });
  const path = join(dir, "skillspector");
  writeFileSync(
    path,
    `#!/bin/sh\nif grep -q EVIL "$2/SKILL.md"; then echo '${flagged}'; exit 1; fi\necho '${clean}'\n`,
  );
  chmodSync(path, 0o755);
  return path;
}

// The stand-in scanner is a shell script, so not on Windows.
describe.skipIf(process.platform === "win32")("skills scan and the safety check", () => {
  it("stops a flagged install, installs it with --accept-risk, and scans the library", async () => {
    sandbox.cleanup();
    const scannerDir = mkdtempSync(join(tmpdir(), "cli-scanner-"));
    sandbox = createSandbox({ safetyScannerPath: fakeScanner(scannerDir) });
    const evil = writeSkill(join(sandbox.root, "src"), "evil", "EVIL");
    const fine = writeSkill(join(sandbox.root, "src"), "fine");
    try {
      expect((await sandbox.cli("skills", "install", fine)).code).toBe(EXIT_OK);
      const stopped = await sandbox.cli("skills", "install", evil);
      expect(stopped.code).toBe(EXIT_FAILED);
      expect(stopped.stderr).toContain("Error (UNSAFE)");
      expect(stopped.stderr).toContain("HIGH Prompt Injection: SKILL.md:6 EVIL");
      expect(stopped.stderr).toContain("--accept-risk");
      const json = await sandbox.cli("skills", "install", evil, "--json");
      expect(json.json()).toMatchObject({
        ok: false,
        code: "UNSAFE",
        details: { flagged: [{ name: "evil", report: { verdict: "unsafe", score: 90 } }] },
      });

      expect((await sandbox.cli("skills", "install", evil, "--accept-risk")).code).toBe(EXIT_OK);
      const scan = await sandbox.cli("skills", "scan", "--all", "--force");
      expect(scan.stdout).toContain("Checked 2 skills: 1 flagged, 0 to review.");
      expect((await sandbox.cli("skills", "scan", "evil")).stdout).toContain(
        "evil: unsafe (risk 90/100, HIGH Prompt Injection in SKILL.md)",
      );
      expect((await sandbox.cli("skills", "scan")).code).toBe(EXIT_USAGE);
    } finally {
      rmSync(scannerDir, { recursive: true, force: true });
    }
  });
});

describe("skills rename", () => {
  it("previews, then renames the folder, the name and the deployment", async () => {
    await cli("skills", "create", "draft-notes", "--description", "Draft notes from a meeting.");
    await cli("skills", "deploy", "draft-notes", "--agent", "claude_code");

    const dry = await cli("skills", "rename", "draft-notes", "meeting-notes", "--dry-run");
    expect(dry.stdout).toContain("Would rename draft-notes to meeting-notes.");
    expect(dry.stdout).toContain("Nothing was changed.");
    expect((await cli("skills", "show", "draft-notes")).code).toBe(EXIT_OK);

    const run = await cli("skills", "rename", "draft-notes", "meeting-notes", "--json");
    expect(run.code).toBe(EXIT_OK);
    expect(run.json()).toMatchObject({
      from: "draft-notes",
      to: "meeting-notes",
      agents: ["claude_code"],
    });
    const document = join(sandbox.libraryDir, "meeting-notes", "SKILL.md");
    expect(readFileSync(document, "utf8")).toContain("name: meeting-notes");
    expect(
      readFileSync(join(sandbox.agentSkillsDir, "meeting-notes", "SKILL.md"), "utf8"),
    ).toContain("name: meeting-notes");
    expect((await cli("skills", "rename", "meeting-notes", "Bad Name")).code).toBe(EXIT_FAILED);
  });
});
