import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Spinner } from "@/components/ui/spinner";

describe("Spinner", () => {
  it("is hidden from screen readers by default, so a button keeps its own name", () => {
    const html = renderToStaticMarkup(
      <button type="button">
        <Spinner />
        Save
      </button>,
    );
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain("role=");
    expect(html).not.toContain("aria-label");
  });

  it("announces its label when it is the only sign of loading", () => {
    const html = renderToStaticMarkup(<Spinner label="Chargement" />);
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-label="Chargement"');
    expect(html).not.toContain("aria-hidden");
  });
});
