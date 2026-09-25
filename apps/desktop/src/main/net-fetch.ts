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
  return fetchManual(url, init);
}) as typeof fetch;

function headerEntries(headers: RequestInit["headers"]): [string, string][] {
  return headers ? [...new Headers(headers).entries()] : [];
}

function abortError(): Error {
  return new DOMException("The request was aborted", "AbortError");
}

function fetchManual(url: string, init: RequestInit): Promise<Response> {
  return new Promise((resolve, reject) => {
    const { signal } = init;
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const request = net.request({ url, method: init.method ?? "GET", redirect: "manual" });
    for (const [name, value] of headerEntries(init.headers)) request.setHeader(name, value);
    const onAbort = (): void => {
      request.abort();
      reject(abortError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    const settle = (): void => signal?.removeEventListener("abort", onAbort);

    request.on("redirect", (status, _method, location) => {
      settle();
      request.abort();
      resolve(new Response(null, { status, headers: { location } }));
    });
    request.on("response", (response) => {
      settle();
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          response.on("data", (chunk) => controller.enqueue(new Uint8Array(chunk)));
          response.on("end", () => controller.close());
          response.on("error", (error) => controller.error(error));
        },
        cancel() {
          request.abort();
        },
      });
      const headers = new Headers();
      for (const [name, value] of Object.entries(response.headers)) {
        for (const one of Array.isArray(value) ? value : [value]) headers.append(name, one);
      }
      resolve(new Response(body, { status: response.statusCode, headers }));
    });
    request.on("error", (error) => {
      settle();
      reject(error);
    });
    request.end();
  });
}
