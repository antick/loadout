import type { SkillTrait } from "@loadout/shared";
import { Terminal } from "lucide-react";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import "@/lib/i18n";
import { ManualOnlyBadge } from "@/components/ManualOnlyBadge";
import { SkillTraitBadges } from "@/components/SkillTraitBadges";
import { StatusBadge } from "@/components/StatusBadge";
import { TooltipProvider } from "@/components/ui/tooltip";

const render = (node: ReactNode): string =>
  renderToStaticMarkup(<TooltipProvider>{node}</TooltipProvider>);

const SCRIPTS: SkillTrait = {
  code: "scripts",
  message: "Ships scripts",
  params: { count: 1, examples: "run.sh" },
};

describe("compact badges", () => {
  it("keep their label for screen readers, since the icon is hidden from them", () => {
    const html = render(<StatusBadge tone="info" icon={<Terminal />} label="Runs code" compact />);
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('<span class="sr-only">Runs code</span>');
    // No tooltip of its own: the native title is the only hover hint.
    expect(html).toContain('title="Runs code"');
    expect(html).not.toContain("<button");
  });
});

describe("badges with a hint", () => {
  it("show one tooltip, reachable from the keyboard", () => {
    const html = render(
      <StatusBadge tone="info" icon={<Terminal />} label="Runs code" compact hint="Scripts" />,
    );
    expect(html).not.toContain("title=");
    expect(html).toMatch(/<button type="button"[^>]*data-slot="tooltip-trigger"/);
    expect(html).toContain('<span class="sr-only">Runs code</span>');
  });

  it.each([
    ["Manual only", <ManualOnlyBadge key="manual" compact />],
    ["Runs code", <SkillTraitBadges key="traits" traits={[SCRIPTS]} compact />],
  ])("%s on a card is named and has no second tooltip", (label, badge) => {
    const html = render(badge);
    expect(html).toContain(`<span class="sr-only">${label}</span>`);
    expect(html).not.toContain("title=");
    expect(html).toContain("<button");
  });
});
