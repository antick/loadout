import type { SkillLocation } from "@loadout/shared";
import type { LinkProps } from "@tanstack/react-router";

/** One string per location: query keys, draft storage and React keys. */
export function locationKey(location: SkillLocation): string {
  switch (location.kind) {
    case "library":
      return `library:${location.skillId}`;
    case "agent":
      return `agent:${location.agentKey}:${location.relativePath}`;
    case "project":
      return `project:${location.projectId}:${location.agentKey}:${location.relativePath}`;
  }
}

/** The editor page for a skill, opened on `file` or its main document. */
export function editLink(location: SkillLocation, file?: string): LinkProps {
  switch (location.kind) {
    case "library":
      return {
        to: "/library/$skillId/edit",
        params: { skillId: location.skillId },
        search: { file },
      };
    case "agent":
      return {
        to: "/agents/$agentKey/edit",
        params: { agentKey: location.agentKey },
        search: { skill: location.relativePath, file },
      };
    case "project":
      return {
        to: "/projects/$projectId/edit",
        params: { projectId: location.projectId },
        search: { skill: location.relativePath, agent: location.agentKey, file },
      };
  }
}

/** The page the editor returns to with Done. */
export function originLink(location: SkillLocation): LinkProps {
  switch (location.kind) {
    case "library":
      return { to: "/library", search: { skill: location.skillId } };
    case "agent":
      return { to: "/agents/$agentKey", params: { agentKey: location.agentKey } };
    case "project":
      return { to: "/projects/$projectId", params: { projectId: location.projectId } };
  }
}
