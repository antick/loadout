import type { IncomingHttpHeaders } from "node:http";
import { describe, expect, it } from "vitest";
import { refuseRequest } from "./request-guard";

const HOST = "localhost:5197";
const OWN = `http://${HOST}`;
const JSON_TYPE = "application/json";

const post = (headers: IncomingHttpHeaders) =>
  refuseRequest({ method: "POST", headers: { host: HOST, ...headers } });
const get = (headers: IncomingHttpHeaders) =>
  refuseRequest({ method: "GET", headers: { host: HOST, ...headers } });

describe("refuseRequest", () => {
  it("runs the preview page's own calls", () => {
    expect(
      post({ origin: OWN, "sec-fetch-site": "same-origin", "content-type": JSON_TYPE }),
    ).toBeNull();
    expect(post({ origin: OWN, "content-type": "application/json; charset=utf-8" })).toBeNull();
    expect(get({ "sec-fetch-site": "same-origin", referer: `${OWN}/#/library` })).toBeNull();
  });

  it("runs a client that is not a browser, like the UI tests' requests", () => {
    expect(post({ "content-type": JSON_TYPE })).toBeNull();
    expect(get({})).toBeNull();
  });

  it("refuses a plain-text POST from another site, which needs no preflight", () => {
    expect(
      post({
        origin: "https://evil.example",
        "sec-fetch-site": "cross-site",
        "content-type": "text/plain",
      }),
    ).not.toBeNull();
    expect(post({ origin: "https://evil.example", "content-type": JSON_TYPE })).not.toBeNull();
  });

  it("refuses another port of localhost", () => {
    expect(post({ origin: "http://localhost:3000", "content-type": JSON_TYPE })).not.toBeNull();
    expect(post({ "sec-fetch-site": "same-site", "content-type": JSON_TYPE })).not.toBeNull();
  });

  it("refuses an opaque origin", () => {
    expect(post({ origin: "null", "content-type": JSON_TYPE })).not.toBeNull();
  });

  it("refuses the event stream to another site", () => {
    expect(get({ origin: "https://evil.example" })).not.toBeNull();
    expect(get({ "sec-fetch-site": "cross-site" })).not.toBeNull();
    expect(get({ referer: "https://evil.example/page" })).not.toBeNull();
  });

  it("refuses a POST from its own page that is not JSON", () => {
    expect(post({ origin: OWN, "content-type": "text/plain" })).not.toBeNull();
    expect(post({ origin: OWN })).not.toBeNull();
    expect(
      post({ origin: OWN, "content-type": "application/x-www-form-urlencoded" }),
    ).not.toBeNull();
  });

  it("matches a default port written out in the Host header", () => {
    expect(
      refuseRequest({
        method: "POST",
        headers: { host: "localhost:80", origin: "http://localhost", "content-type": JSON_TYPE },
      }),
    ).toBeNull();
  });
});
