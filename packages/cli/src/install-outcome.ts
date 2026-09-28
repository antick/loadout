import type { InstallOutcome } from "@loadout/shared";

/**
 * A short label for what installing under a name does; empty for a new name. The picker and
 * `skills install --dry-run` both use it, so the terminal says the same thing everywhere.
 */
export function outcomeLabel(outcome: InstallOutcome): string {
  switch (outcome.kind) {
    case "installed":
      return `in library (if changed: ${outcome.installAs})`;
    case "taken":
      return outcome.owner?.source
        ? `name in use → ${outcome.installAs} (taken by ${outcome.owner.source})`
        : `name in use → ${outcome.installAs}`;
    case "repeated":
      return `same name twice → ${outcome.installAs}`;
    case "replaces":
      return `replaces ${outcome.installAs} (old version to Recently removed)`;
    default:
      return "";
  }
}
