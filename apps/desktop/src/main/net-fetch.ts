import { net } from "electron";

/**
 * The app's HTTP client: `net.fetch`, which honours the session proxy (and so the proxy setting).
 *
 * `net.fetch` fails on `redirect: "manual"` instead of answering with the redirect, and never
 * reports where a followed redirect went. Downloads that must see each hop (to ask before
 * installing from another site) ask for `"manual"`; those go through `net.request`, which answers
 * a redirect with its status and `Location`, the way Node's fetch does.
 */
export const appFetch = ((input: string | URL | Request, init?: RequestInit) => {
  const url = input instanceof Request ? input.url : String(input);
  if (init?.redirect !== "manual") return net.fetch(url, init);
  return fetchManual((options) => net.request(options), url, init);
}) as typeof fetch;

/** The part of Electron's `ClientRequest` a manual fetch uses. */
export interface ManualRequest {
  setHeader(name: string, value: string): void;
  write(chunk: string | Buffer): void;
  end(): void;
  abort(): void;
  on(event: "redirect", listener: (status: number, method: string, location: string) => void): this;
  on(event: "response", listener: (response: ManualResponse) => void): this;
  on(event: "error", listener: (error: Error) => void): this;
}

/** The part of Electron's `IncomingMessage` a manual fetch uses. */
export interface ManualResponse {
  statusCode: number;
  headers: Record<string, string | string[]>;
  on(event: "data", listener: (chunk: Buffer) => void): this;
  on(event: "end", listener: () => void): this;
  on(event: "error", listener: (error: Error) => void): this;
}

export type OpenRequest = (options: {
  url: string;
  method: string;
  redirect: "manual";
}) => ManualRequest;

function headerEntries(headers: RequestInit["headers"]): [string, string][] {
  return headers ? [...new Headers(headers).entries()] : [];
}

function abortError(): Error {
  return new DOMException("The request was aborted", "AbortError");
}

/** A request body as bytes; only the kinds Loadout sends. */
function bodyBytes(body: RequestInit["body"]): string | Buffer | null {
  if (body === undefined || body === null) return null;
  if (typeof body === "string") return body;
  if (body instanceof ArrayBuffer) return Buffer.from(body);
  if (ArrayBuffer.isView(body)) return Buffer.from(body.buffer, body.byteOffset, body.byteLength);
  throw new TypeError("A manual-redirect request can only send a string or bytes");
}

/**
 * `fetch` with `redirect: "manual"` over `net.request`. The signal stays in force until the body
 * has arrived: cancelling, or a timeout, also stops a download that already started.
 */
export function fetchManual(open: OpenRequest, url: string, init: RequestInit): Promise<Response> {
  return new Promise((resolve, reject) => {
    const { signal } = init;
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const body = bodyBytes(init.body);
    const request = open({ url, method: init.method ?? "GET", redirect: "manual" });
    for (const [name, value] of headerEntries(init.headers)) request.setHeader(name, value);
    // Before the answer: reject the fetch. After it: fail the body being read.
    let onAbort = (): void => {
      request.abort();
      reject(abortError());
    };
    const listener = (): void => onAbort();
    signal?.addEventListener("abort", listener, { once: true });
    const settle = (): void => signal?.removeEventListener("abort", listener);

    request.on("redirect", (status, _method, location) => {
      settle();
      request.abort();
      resolve(new Response(null, { status, headers: { location } }));
    });
    request.on("response", (response) => {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          onAbort = () => {
            request.abort();
            controller.error(abortError());
          };
          response.on("data", (chunk) => controller.enqueue(new Uint8Array(chunk)));
          response.on("end", () => {
            settle();
            controller.close();
          });
          response.on("error", (error) => {
            settle();
            controller.error(error);
          });
        },
        cancel() {
          settle();
          request.abort();
        },
      });
      const headers = new Headers();
      for (const [name, value] of Object.entries(response.headers)) {
        for (const one of Array.isArray(value) ? value : [value]) headers.append(name, one);
      }
      resolve(new Response(stream, { status: response.statusCode, headers }));
    });
    request.on("error", (error) => {
      settle();
      reject(error);
    });
    if (body !== null) request.write(body);
    request.end();
  });
}
