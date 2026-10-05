import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import "@/lib/i18n";
import { AgentPicker, type AgentTargetChip } from "@/components/AgentPicker";
import { TooltipProvider } from "@/components/ui/tooltip";

const render = (node: ReactNode): string =>
  renderToStaticMarkup(<TooltipProvider>{node}</TooltipProvider>);

const ITEMS: AgentTargetChip[] = [
  { key: "claude_code", label: "Claude Code", agentKeys: ["claude_code"], note: "2 to add" },
  { key: "cursor", label: "Cursor", agentKeys: ["cursor"], note: "Has all" },
];
const noop = (): void => undefined;

describe("AgentPicker", () => {
  it("shows chips with select all and clear", () => {
    const html = render(
      <AgentPicker
        layout="chips"
        label="Agents"
        items={ITEMS}
        selected={new Set(["cursor"])}
        onChange={noop}
      />,
    );
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("Select all");
    expect(html).toContain("Clear");
  });

  it("hides select all and clear for a locked chip", () => {
    const html = render(
      <AgentPicker
        layout="chips"
        label="Agents"
        items={ITEMS}
        selected={new Set()}
        onChange={noop}
        locked
      />,
    );
    expect(html).not.toContain("Select all");
  });

  it("lists every agent with its note, offering select none once all are ticked", () => {
    const html = render(
      <AgentPicker
        layout="list"
        label="Agents"
        items={ITEMS}
        selected={new Set(["claude_code", "cursor"])}
        onChange={noop}
      />,
    );
    expect(html).toContain("2 to add");
    expect(html).toContain("Has all");
    expect(html).toContain("Select none");
  });

  it("says so when there is no agent to pick", () => {
    const html = render(
      <AgentPicker
        layout="list"
        label="Agents"
        items={[]}
        selected={new Set()}
        onChange={noop}
        emptyText="No agents"
      />,
    );
    expect(html).toContain("No agents");
  });
});
