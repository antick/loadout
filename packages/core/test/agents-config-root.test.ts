import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createInstructionFinder } from "../src/instructions";
import { osConfigDir } from "../src/paths";
import { type WorkspaceWorld, createWorkspaceWorld } from "./workspace-world";

/**
 * An agent found in the OS config folder (`$XDG_CONFIG_HOME`, or Application Support on macOS)
 * rather than `~/.config`: folders it has not made yet belong there too.
 */
describe("an agent found in the OS config folder", () => {
  let world: WorkspaceWorld;
  let configRoot: string;

  beforeEach(() => {
    world = createWorkspaceWorld();
    vi.stubEnv("XDG_CONFIG_HOME", join(world.home, "xdg"));
    configRoot = osConfigDir(world.home);
    mkdirSync(join(configRoot, "goose"), { recursive: true });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    world.cleanup();
  });

  it("gets its skills folder there, and deploys into it", async () => {
    const goose = world.registry.get("goose");
    expect(goose.installed).toBe(true);
    expect(goose.detection).toEqual({ reason: "folder", path: join(configRoot, "goose") });
    expect(goose.skillsDir).toBe(join(configRoot, "goose", "skills"));

    const skill = world.addSkill("alpha");
    await world.deploy.api.deploy(skill.id, "goose");
    expect(world.store.deployment(skill.id, "goose")?.targetPath).toBe(
      join(configRoot, "goose", "skills", "alpha"),
    );
  });

  it("still prefers a skills folder that exists under ~/.config", () => {
    mkdirSync(join(world.home, ".config", "goose", "skills"), { recursive: true });
    expect(world.registry.get("goose").skillsDir).toBe(
      join(world.home, ".config", "goose", "skills"),
    );
  });

  it("gets its global instruction file there", async () => {
    const finder = createInstructionFinder({
      registry: world.registry,
      projects: world.projects.projects,
    });
    const files = await finder.list(null);
    const hints = files.find((file) => file.readers.some((reader) => reader.agentKey === "goose"));
    expect(hints?.path).toBe(join(configRoot, "goose", ".goosehints"));
  });
});
