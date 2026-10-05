import { type Server, createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { routeWebRequestsThroughProxy } from "../src/util/proxy";

const nodeCanProxy = Number(process.versions.node.split(".")[0]) >= 24;

describe("routeWebRequestsThroughProxy", () => {
  let server: Server | null = null;
  let undo: (() => void) | null = null;
  afterEach(() => {
    undo?.();
    undo = null;
    server?.close();
    server = null;
  });

  it.runIf(nodeCanProxy)("sends fetch through the proxy", async () => {
    // Node's fetch tunnels every request through the proxy with CONNECT; this one refuses it.
    const tunnels: string[] = [];
    server = createServer();
    server.on("connect", (request, socket) => {
      tunnels.push(request.url ?? "");
      socket.end("HTTP/1.1 502 Bad Gateway\r\n\r\n");
    });
    await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;

    undo = routeWebRequestsThroughProxy(`http://127.0.0.1:${port}`, () => {});
    expect(undo).not.toBeNull();
    await expect(fetch("http://skills.example.invalid/index.json")).rejects.toThrow();
    expect(tunnels).toEqual(["skills.example.invalid:80"]);
  });

  it("changes nothing without a proxy, and says why a SOCKS one is not used", () => {
    const warnings: string[] = [];
    expect(routeWebRequestsThroughProxy(null, (message) => warnings.push(message))).toBeNull();
    expect(warnings).toEqual([]);
    expect(
      routeWebRequestsThroughProxy("socks5://127.0.0.1:1080", (message) => warnings.push(message)),
    ).toBeNull();
    expect(warnings).toEqual(["Web requests go direct: only git can use a SOCKS proxy."]);
  });
});
