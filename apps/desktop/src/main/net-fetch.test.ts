import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { type ManualRequest, type ManualResponse, fetchManual } from "./net-fetch";

vi.mock("electron", () => ({ net: {} }));

/** A `net.request` stand-in that the test answers by hand. */
function fakeRequest() {
  const request = Object.assign(new EventEmitter(), {
    headers: {} as Record<string, string>,
    written: [] as (string | Buffer)[],
    ended: false,
    aborted: false,
    setHeader(name: string, value: string) {
      request.headers[name] = value;
    },
    write(chunk: string | Buffer) {
      request.written.push(chunk);
    },
    end() {
      request.ended = true;
    },
    abort() {
      request.aborted = true;
    },
  });
  const respond = (statusCode = 200): EventEmitter => {
    const response = Object.assign(new EventEmitter(), { statusCode, headers: { "x-a": "1" } });
    request.emit("response", response as unknown as ManualResponse);
    return response;
  };
  return { request, open: () => request as unknown as ManualRequest, respond };
}

describe("fetch with manual redirects", () => {
  it("answers a redirect with its status and address", async () => {
    const { request, open } = fakeRequest();
    const fetching = fetchManual(open, "https://a.test/x", { redirect: "manual" });
    request.emit("redirect", 302, "GET", "https://b.test/y");
    const response = await fetching;
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://b.test/y");
    expect(request.aborted).toBe(true);
  });

  it("streams the body and sends headers and a body", async () => {
    const { request, open, respond } = fakeRequest();
    const fetching = fetchManual(open, "https://a.test/x", {
      redirect: "manual",
      method: "POST",
      headers: { Accept: "text/plain" },
      body: "hello",
    });
    const response = respond();
    const answer = await fetching;
    response.emit("data", Buffer.from("he"));
    response.emit("data", Buffer.from("llo"));
    response.emit("end");
    expect(await answer.text()).toBe("hello");
    expect(answer.headers.get("x-a")).toBe("1");
    expect(request.headers).toEqual({ accept: "text/plain" });
    expect(request.written).toEqual(["hello"]);
  });

  it("stops a body that is still arriving when the signal fires", async () => {
    const { request, open, respond } = fakeRequest();
    const controller = new AbortController();
    const fetching = fetchManual(open, "https://a.test/x", {
      redirect: "manual",
      signal: controller.signal,
    });
    const response = respond();
    const answer = await fetching;
    response.emit("data", Buffer.from("partial"));
    const reading = answer.arrayBuffer();
    controller.abort();
    await expect(reading).rejects.toMatchObject({ name: "AbortError" });
    expect(request.aborted).toBe(true);
  });

  it("rejects at once when the signal fires before the answer", async () => {
    const { request, open } = fakeRequest();
    const controller = new AbortController();
    const fetching = fetchManual(open, "https://a.test/x", {
      redirect: "manual",
      signal: controller.signal,
    });
    controller.abort();
    await expect(fetching).rejects.toMatchObject({ name: "AbortError" });
    expect(request.aborted).toBe(true);
  });
});
