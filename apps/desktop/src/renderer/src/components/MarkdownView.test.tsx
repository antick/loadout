import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import "@/lib/i18n";
import { MarkdownView } from "./MarkdownView";

const render = (content: string): string =>
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <MarkdownView content={content} />
    </QueryClientProvider>,
  );

const PIXEL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

describe("Markdown images", () => {
  it("shows embedded images, and never fetches one from the web", () => {
    expect(render(`![dot](${PIXEL})`)).toContain(`src="${PIXEL}"`);
    const remote = render("![logo](https://tracker.example/p.png)");
    expect(remote).not.toContain("<img");
    const relative = render("![logo](//tracker.example/p.png)");
    expect(relative).not.toContain("<img");
    expect(relative).toContain("https://tracker.example/p.png");
  });

  it("names an image from the skill's folder or the disk instead of loading it", () => {
    for (const path of ["assets/diagram.png", "/Users/me/secret.png"]) {
      const html = render(`![diagram](${path})`);
      expect(html).not.toContain("<img");
      expect(html).toContain("Image: diagram");
    }
  });

  it("shows frontmatter with a repeated key as the YAML it is", () => {
    const html = render("---\nname: a\nname: b\n---\n\nBody");
    expect(html).not.toContain("<dt");
    expect(html).toContain("language-yaml");
  });
});
