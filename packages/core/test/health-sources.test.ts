import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { SOURCE_STALE_AFTER_MS } from "@loadout/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sourceFindings } from "../src/health/sources";
import { tempDir } from "./helpers";
import { skillRecord } from "./skill-records";

const NOW = Date.UTC(2026, 8, 28);
const REPO = "https://github.com/acme/skills.git";
const fromRepo = { sourceType: "git", sourceUrl: REPO, sourceRef: REPO } as const;

let dir: { dir: string; cleanup: () => void };

beforeEach(() => {
  dir = tempDir();
});

afterEach(() => dir.cleanup());

describe("doctor: sources", () => {
  it("names a repository nobody checked for a month, once", () => {
    const old = NOW - SOURCE_STALE_AFTER_MS - 1;
    const findings = sourceFindings(
      [
        skillRecord("a", { ...fromRepo, lastCheckedAt: old }),
        skillRecord("b", { ...fromRepo, lastCheckedAt: null, createdAt: old }),
      ],
      NOW,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      area: "sources",
      severity: "warning",
      source: "acme/skills",
    });
    expect(findings[0]?.message).toMatch(/^Not checked for updates since .+skills check --all$/);
  });

  it("leaves a repository alone when one of its skills was checked recently", () => {
    const findings = sourceFindings(
      [
        skillRecord("a", { ...fromRepo, lastCheckedAt: NOW - SOURCE_STALE_AFTER_MS * 2 }),
        skillRecord("b", { ...fromRepo, lastCheckedAt: NOW - 1000 }),
        // Installed yesterday and never checked: not stale either.
        skillRecord("c", { sourceType: "url", sourceRef: "https://x.dev/c.zip", createdAt: NOW }),
      ],
      NOW,
    );
    expect(findings).toEqual([]);
  });

  it("names an archive that is gone, unless its skills already say so", () => {
    const kept = join(dir.dir, "kept.zip");
    writeFileSync(kept, "");
    const gone = join(dir.dir, "gone.zip");
    const findings = sourceFindings(
      [
        skillRecord("a", { sourceRef: kept }),
        skillRecord("b", { sourceRef: gone }),
        skillRecord("c", {
          sourceRef: join(dir.dir, "flagged.zip"),
          updateStatus: "source_missing",
        }),
      ],
      NOW,
    );
    expect(findings).toEqual([
      expect.objectContaining({ source: "gone.zip", path: gone, severity: "warning" }),
    ]);
  });
});
