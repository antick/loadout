import type { IncomingHttpHeaders } from "node:http";

/** The only body the preview's API reads. Anything else could come from a plain HTML form. */
const JSON_MEDIA_TYPE = "application/json";
/** `Sec-Fetch-Site` of the preview's own page, or of an address typed into the browser. */
const OWN_FETCH_SITES: ReadonlySet<string> = new Set(["same-origin", "none"]);

export interface GuardedRequest {
  method?: string;
  headers: IncomingHttpHeaders;
}

/**
 * Why a request to the preview's API must not run, or null when it may. The session's core is
 * real and its calls take absolute paths, so a page on another site, or on another port of
 * localhost, must never reach it while the preview runs: a `text/plain` POST is sent without a
 * CORS preflight, and a GET of the event stream needs none. Every origin hint the browser gave
 * must name this server. A client that is not a browser (the UI tests' request context) sends
 * none, and gets through.
 */
export function refuseRequest({ method, headers }: GuardedRequest): string | null {
  const host = headers.host;
  const origin = single(headers.origin);
  if (origin !== undefined && !sameHost(origin, host)) return `Refused a request from ${origin}`;
  const site = single(headers["sec-fetch-site"]);
  if (site !== undefined && !OWN_FETCH_SITES.has(site)) return `Refused a ${site} request`;
  const referer = single(headers.referer);
  if (referer !== undefined && !sameHost(referer, host)) return `Refused a request from ${referer}`;
  if (method === "POST" && mediaType(headers["content-type"]) !== JSON_MEDIA_TYPE) {
    return `Refused a POST that is not ${JSON_MEDIA_TYPE}`;
  }
  return null;
}

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Does `url` (an Origin or Referer) point at the server the request was sent to? */
function sameHost(url: string, host: string | undefined): boolean {
  if (!host) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    // Through `URL` too, so a default port written out (`localhost:80`) compares equal.
    return parsed.host === new URL(`${parsed.protocol}//${host}`).host;
  } catch {
    // `null` (a sandboxed frame, a file) or garbage.
    return false;
  }
}

function mediaType(contentType: string | undefined): string {
  return (contentType ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
}
