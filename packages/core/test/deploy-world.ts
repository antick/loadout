import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Skill } from "@loadout/shared";
import { AgentRegistry, type AgentsService, createAgentsService } from "../src/agents";
import { type DeployService, createDeployService } from "../src/deploy";
import { hashDir } from "../src/util/hash";
import { type TestWorld, createTestWorld, makeSkill } from "./helpers";

export interface DeployWorld extends TestWorld {
  registry: AgentRegistry;
  deploy: DeployService;
  agents: AgentsService;
  /** Create a skill folder in the library and its row. */
  addSkill(dirName: string, files?: Record<string, string>): Skill;
  /** Make built-in agents look installed by creating their detect folders under the fake home. */
  installAgents(...detectDirs: string[]): void;
  /** Re-hash a library skill after its files changed, as an update would. */
  rehash(skill: Skill): Skill;
}

/** A test world with the agents and deploy services wired the way `createCore` wires them. */
export function createDeployWorld(): DeployWorld {
  const world = createTestWorld();
  const registry = new AgentRegistry(world.ctx);
  const deploy = createDeployService(world.ctx, { store: world.store, registry });
  const agents = createAgentsService(world.ctx, { registry, deploy });
  return {
    ...world,
    registry,
    deploy,
    agents,
    addSkill: (dirName, files) => {
      const libraryPath = makeSkill(world.ctx.paths.skillsDir, dirName, { files });
      return world.store.insert({
        name: dirName,
        description: null,
        sourceType: "local",
        libraryPath,
        contentHash: hashDir(libraryPath),
        updateStatus: "local_only",
      });
    },
    installAgents: (...detectDirs) => {
      for (const dir of detectDirs) mkdirSync(join(world.home, dir), { recursive: true });
    },
    rehash: (skill) => world.store.update(skill.id, { contentHash: hashDir(skill.libraryPath) }),
  };
}
