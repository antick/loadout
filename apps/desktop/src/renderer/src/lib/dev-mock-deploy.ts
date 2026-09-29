/** DEV ONLY. Deploying, undeploying and blocking for the browser preview. */
import type { ApplyResult, DataScope, ErrorCode, Skill } from "@loadout/shared";
import { emptyApplyResult } from "@/lib/dev-mock-data";

type Handler = (...args: never[]) => unknown;

/** The skill the preview pretends has an unmanaged folder in the way. */
const CONFLICTING_SKILL = "release-notes";

export interface DeployMockDeps {
  getSkills: () => Skill[];
  setSkills: (next: Skill[]) => void;
  /** Deploy or remove one pair; false when it was already so. */
  setDeployed: (skillId: string, agentKey: string, on: boolean) => boolean;
  emitChanged: (...scope: DataScope[]) => void;
  fail: (code: ErrorCode, message: string) => never;
}

export function createDeployMockHandlers(deps: DeployMockDeps): Record<string, Handler> {
  const { getSkills, setSkills, setDeployed, emitChanged, fail } = deps;
  const find = (skillId: string): Skill => {
    const found = getSkills().find((entry) => entry.id === skillId);
    return found ?? fail("NOT_FOUND", `There is no skill "${skillId}".`);
  };

  return {
    "deploy.deploy": (skillId: string, agentKey: string) => {
      if (skillId === CONFLICTING_SKILL) {
        fail("TARGET_CONFLICT", "A folder that was not installed from the library is in the way.");
      }
      if (find(skillId).blockedAgents.includes(agentKey)) {
        fail("INVALID_INPUT", "This skill is blocked for that agent.");
      }
      setDeployed(skillId, agentKey, true);
      emitChanged("skills");
    },
    "deploy.undeploy": (skillId: string, agentKey: string) => {
      setDeployed(skillId, agentKey, false);
      emitChanged("skills");
    },
    "deploy.setBlocked": (skillId: string, agentKeys: string[], blocked: boolean): Skill => {
      if (blocked) for (const agentKey of agentKeys) setDeployed(skillId, agentKey, false);
      const kept = find(skillId).blockedAgents.filter((key) => !agentKeys.includes(key));
      const blockedAgents = blocked ? [...kept, ...agentKeys] : kept;
      setSkills(
        getSkills().map((entry) => (entry.id === skillId ? { ...entry, blockedAgents } : entry)),
      );
      emitChanged("skills");
      return find(skillId);
    },
    "deploy.apply": (
      skillIds: string[],
      agentKeys: string[],
      action: "add" | "remove",
    ): ApplyResult => {
      const result = emptyApplyResult();
      for (const skillId of skillIds) {
        for (const agentKey of agentKeys) {
          if (action === "add" && find(skillId).blockedAgents.includes(agentKey)) {
            result.blocked += 1;
          } else if (!setDeployed(skillId, agentKey, action === "add")) result.skipped += 1;
          else if (action === "add") result.added += 1;
          else result.removed += 1;
        }
      }
      emitChanged("skills");
      return result;
    },
  };
}
