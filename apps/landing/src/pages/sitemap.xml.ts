import type { APIRoute } from "astro";
import { SITE_URL } from "../lib/site";

/** Every page of the site, found from the page files so a new page is listed without a change. */
const pages = Object.keys(import.meta.glob("./**/*.astro")).map(
  (file) =>
    file
      .slice(1)
      .replace(/\.astro$/, "")
      .replace(/(^|\/)index$/, "$1") || "/",
);

const escapeXml = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const GET: APIRoute = () => {
  const urls = pages
    .map((path) => `  <url><loc>${escapeXml(new URL(path, SITE_URL).toString())}</loc></url>`)
    .join("\n");
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
    { headers: { "Content-Type": "application/xml; charset=utf-8" } },
  );
};
