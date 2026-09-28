import type { APIRoute } from "astro";
import { SITE_URL } from "../lib/site";

/** Everything may be crawled; the sitemap says what there is. */
export const GET: APIRoute = () =>
  new Response(`User-agent: *\nAllow: /\n\nSitemap: ${new URL("/sitemap.xml", SITE_URL)}\n`, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
