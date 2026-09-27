import type { AgentInfo } from "@loadout/shared";
import { describe, expect, it } from "vitest";
import { describeReload, reloadHint } from "./agent-reload";

const agent = (displayName: string, reload: AgentInfo["reload"]) => ({ displayName, reload });

describe("agent reload wording", () => {
  it("describes one agent from what its documentation says, and nothing when it is silent", () => {
    expect(describeReload(agent("Claude Code", { when: "live", command: "/reload-skills" }))).toBe(
      "Claude Code picks up new, changed and removed skills while it runs. If one does not show up, type /reload-skills.",
    );
    expect(describeReload(agent("Amp", { when: "new_session", ask: "Reload my skills" }))).toBe(
      "Amp sees new, changed and removed skills in a new session. In a running session, ask it to “Reload my skills”.",
    );
    expect(describeReload(agent("OpenCode", { when: "restart" }))).toBe(
      "Restart OpenCode to see new, changed and removed skills.",
    );
    expect(describeReload(agent("Cursor", null))).toBeNull();
  });

  it("groups several agents by what they need, and stays quiet about the live ones", () => {
    expect(
      reloadHint([
        agent("Claude Code", { when: "live" }),
        agent("OpenCode", { when: "restart" }),
        agent("Goose", { when: "new_session" }),
        agent("Warp", { when: "new_session" }),
        agent("Cursor", null),
      ]),
    ).toBe(
      "Restart OpenCode to see the change. Start a new session in Goose and Warp to see the change.",
    );
    expect(reloadHint([agent("Claude Code", { when: "live" })])).toBe(
      "Claude Code picks it up while it runs.",
    );
    expect(reloadHint([agent("Cursor", null)])).toBeNull();
  });
});
