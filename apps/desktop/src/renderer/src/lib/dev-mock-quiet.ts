/** DEV ONLY. Calls that only need to succeed, and ones the preview cannot do. */
import type { MockChannel, MockHandlers } from "@/lib/dev-mock-types";

const SUCCEED = [
  "app.quit",
  "app.revealPath",
  "app.openInEditor",
  "app.resolveClose",
  "skills.reveal",
  "projects.reveal",
  "system.clearLastCrash",
] as const satisfies readonly MockChannel[];

/** Answered with a plain "not in the preview", so a screen says why instead of breaking. */
const DESKTOP_ONLY = [
  "items.create",
  "items.preview",
  "items.get",
  "items.save",
  "items.remove",
  "items.deploy",
  "items.undeploy",
  "projects.createSkill",
] as const satisfies readonly MockChannel[];

const NOT_IN_PREVIEW = "The browser preview cannot do this; try it in the desktop app.";

export function createQuietMockHandlers(): MockHandlers {
  return {
    ...Object.fromEntries(SUCCEED.map((channel) => [channel, () => undefined])),
    ...Object.fromEntries(
      DESKTOP_ONLY.map((channel) => [
        channel,
        () => {
          throw new Error(NOT_IN_PREVIEW);
        },
      ]),
    ),
  };
}
