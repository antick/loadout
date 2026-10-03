const WEB_PROTOCOLS: ReadonlySet<string> = new Set(["http:", "https:"]);

/** A web page link: only these leave the app for the browser, whatever the casing. */
export function isWebUrl(url: string): boolean {
  try {
    return WEB_PROTOCOLS.has(new URL(url).protocol);
  } catch {
    return false;
  }
}
