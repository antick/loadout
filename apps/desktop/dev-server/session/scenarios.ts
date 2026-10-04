/**
 * States the seed does not have, reached the way the app gets there: another device syncing the
 * same backup, a deployment broken in an agent's folder, a token saved. The UI tests ask for one
 * by name (`setUp` in `e2e/app.ts`) before they open the page.
 */
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { type Core, createCore, silentLogger } from "@loadout/core";
import type { CoreApi } from "@loadout/shared";
import { allowHeldBack, installFolder, saveFile, skillNamed } from "./actions.ts";
import { writeFiles } from "./files.ts";
import {
  BACKUP_REPOSITORY,
  BROKEN_DEPLOYMENT,
  CLAWHUB_TOKEN,
  CONFLICTING,
  MANY_DELETED,
  OTHER_DEVICE_NAME,
  SCENARIO_SKILLS,
} from "./fixtures.ts";
import { skillDocument } from "./fixtures-skills.ts";
import { fileSecrets } from "./world.ts";
import type { World } from "./world.ts";

type Scenario = (world: World, api: CoreApi) => Promise<unknown>;

/** Add skills of `SCENARIO_SKILLS` here and back them up, so both devices have them. */
async function addAndBackUp(world: World, api: CoreApi, names: string[]): Promise<void> {
  for (const name of names) {
    const description = SCENARIO_SKILLS[name] ?? name;
    await installFolder(world, api, name, {
      "SKILL.md": skillDocument(name, description, description),
    });
  }
  await allowHeldBack(api);
  await api.backup.sync();
}

/** A second computer joining the same backup, changing things there, and syncing. */
async function onOtherDevice(world: World, change: (api: CoreApi) => Promise<void>) {
  const home = join(world.live, "other-device");
  mkdirSync(home, { recursive: true });
  const other: Core = createCore({
    homeDir: home,
    logger: silentLogger,
    secrets: fileSecrets({ ...world, secretsFile: join(home, "secrets.json") }),
    safetyScannerPath: null,
    migrateLibrary: false,
  });
  try {
    await other.api.backup.setDeviceName(OTHER_DEVICE_NAME);
    await other.api.backup.clone(join(world.remotes, BACKUP_REPOSITORY));
    await change(other.api);
    await allowHeldBack(other.api);
    await other.api.backup.sync();
  } finally {
    other.close();
  }
}

const document = (name: string, text: string): string => skillDocument(name, text, text);

const SCENARIOS: Record<string, Scenario> = {
  "backup-up-to-date": async (_world, api) => {
    await allowHeldBack(api);
    await api.backup.sync();
  },
  "backup-no-remote": (_world, api) => api.backup.removeRemote(),

  /** The other device edited, deleted and changed a preset; this one tagged a skill. */
  "backup-incoming": async (world, api) => {
    await addAndBackUp(world, api, ["old-notes"]);
    await onOtherDevice(world, async (other) => {
      await saveFile(other, "code-review", "examples.md", "# Examples\n\nFrom the laptop.\n");
      const [preset] = await other.presets.list();
      if (preset) await other.presets.update(preset.id, { ...preset, description: "Laptop" });
      await other.skills.removeMany([(await skillNamed(other, "old-notes")).id]);
    });
    await api.skills.setTags((await skillNamed(api, "test-first")).id, ["testing"]);
  },

  "backup-many-deletions": async (world, api) => {
    await addAndBackUp(world, api, Object.keys(SCENARIO_SKILLS));
    await onOtherDevice(world, async (other) => {
      const ids = await Promise.all(MANY_DELETED.map((name) => skillNamed(other, name)));
      await other.skills.removeMany(ids.map((skill) => skill.id));
      // Two more changes, so the review is long enough to offer its search and filter.
      for (const name of ["commit-helper", "release-notes"]) {
        await saveFile(other, name, "SKILL.md", document(name, "Changed on the laptop."));
      }
    });
  },

  "backup-conflicts": async (world, api) => {
    await addAndBackUp(world, api, ["sql-helper"]);
    await onOtherDevice(world, async (other) => {
      for (const name of CONFLICTING) {
        await saveFile(other, name, "SKILL.md", document(name, "Changed on the laptop."));
      }
    });
    for (const name of CONFLICTING) {
      await saveFile(api, name, "SKILL.md", document(name, "Changed on this computer."));
    }
    await api.backup.sync();
  },

  /** Someone put a folder of their own where a deployment was; the repair cannot undo that. */
  "repair-failed": async (world, api) => {
    const { skill, agent, dir } = BROKEN_DEPLOYMENT;
    await api.deploy.deploy((await skillNamed(api, skill)).id, agent);
    const target = join(world.home, dir, skill);
    rmSync(target, { recursive: true, force: true });
    writeFiles(target, { "SKILL.md": document(skill, "Written by hand.") });
    return api.system.repairDeployments();
  },
  /** The folder in the way is gone again, so a retry can put the deployment back. */
  "repair-unblocked": async (world) => {
    rmSync(join(world.home, BROKEN_DEPLOYMENT.dir, BROKEN_DEPLOYMENT.skill), {
      recursive: true,
      force: true,
    });
  },

  "clawhub-signed-in": (_world, api) => api.publish.setClawhubToken(CLAWHUB_TOKEN),
};

export async function runScenario(name: string, world: World, api: CoreApi): Promise<unknown> {
  const scenario = SCENARIOS[name];
  if (!scenario) throw new Error(`There is no scenario called ${name}`);
  return scenario(world, api);
}
