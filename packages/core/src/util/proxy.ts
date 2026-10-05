import http from "node:http";

/** What Node 24 and later offer to send its own `fetch` and `http` requests through a proxy. */
type SetGlobalProxy = (env: Record<string, string>) => () => void;

/** The schemes Node's built-in proxy support understands; SOCKS is only for git. */
const NODE_PROXY_PATTERN = /^https?:\/\//i;

/**
 * Send this process's web requests through the proxy setting, as the desktop app does with its
 * own `fetch`. Only for a host that brings no `fetch` (the CLI). Returns how to undo it, or null
 * when nothing was changed; `warn` says why a set proxy could not be used.
 */
export function routeWebRequestsThroughProxy(
  proxyUrl: string | null,
  warn: (message: string) => void,
): (() => void) | null {
  if (!proxyUrl) return null;
  if (!NODE_PROXY_PATTERN.test(proxyUrl)) {
    warn("Web requests go direct: only git can use a SOCKS proxy.");
    return null;
  }
  const setGlobalProxy = (http as { setGlobalProxyFromEnv?: SetGlobalProxy }).setGlobalProxyFromEnv;
  if (!setGlobalProxy) {
    warn(`Web requests go direct: Node ${process.version} cannot use a proxy. Node 24 can.`);
    return null;
  }
  const noProxy = process.env.NO_PROXY ?? process.env.no_proxy;
  return setGlobalProxy({
    HTTP_PROXY: proxyUrl,
    HTTPS_PROXY: proxyUrl,
    ...(noProxy ? { NO_PROXY: noProxy } : {}),
  });
}
