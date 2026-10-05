import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import "@/lib/i18n";
import { AgentBadgeRow, type BadgeAgent } from "@/components/AgentBadgeRow";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AGENT_BADGE_MAX_VISIBLE } from "@/lib/constants";

const AGENTS: BadgeAgent[] = Array.from({ length: AGENT_BADGE_MAX_VISIBLE + 2 }, (_, index) => ({
  key: `agent-${index}`,
  displayName: `Agent ${index}`,
}));

/** The row's buttons by accessible name, in the order they are drawn. */
function buttons(deployed: readonly string[]): string[] {
  const html = renderToStaticMarkup(
    <TooltipProvider>
      <AgentBadgeRow agents={AGENTS} deployedKeys={new Set(deployed)} onToggle={() => undefined} />
    </TooltipProvider>,
  );
  return [...html.matchAll(/aria-label="([^"]*)"/g)]
    .map((match) => match[1] ?? "")
    .filter((label) => label !== "Agents");
}

describe("agent badges", () => {
  it("keep their places when a skill is deployed, so the next click hits the same agent", () => {
    const before = buttons([]);
    const after = buttons(["agent-3"]);
    expect(after).toHaveLength(before.length);
    expect(after[0]).toBe("Not installed for Agent 0. Click to install");
    expect(after[3]).toBe("Installed for Agent 3. Click to remove");
    expect(after.filter((_, index) => index !== 3)).toEqual(
      before.filter((_, index) => index !== 3),
    );
  });

  it("keep the same agents in +N, and it says how many of them have the skill", () => {
    const hidden = `agent-${AGENT_BADGE_MAX_VISIBLE + 1}`;
    expect(buttons([]).at(-1)).toBe("2 more agents");
    expect(buttons([hidden]).at(-1)).toBe("2 more agents. Installed for 1 of them");
  });
});
