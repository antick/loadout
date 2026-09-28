/** DEV ONLY. Calls that only need to succeed, and lists that are empty in the preview. */

type Handler = (...args: never[]) => unknown;

const SUCCEED = [
  "app.revealPath",
  "app.resolveClose",
  "skills.reveal",
  "projects.reveal",
  "system.clearLastCrash",
] as const;

const EMPTY_LISTS = [
  "projects.skills",
  "projects.targets",
  "workspace.list",
  "system.activity",
] as const;

export function createQuietMockHandlers(): Record<string, Handler> {
  return {
    ...Object.fromEntries(SUCCEED.map((channel) => [channel, () => undefined])),
    ...Object.fromEntries(EMPTY_LISTS.map((channel) => [channel, () => []])),
  };
}
