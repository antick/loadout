import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { downloadVerified } from "./download";

const BODY = Buffer.from("0123456789".repeat(100));
const FILE = {
  name: "Loadout.zip",
  url: "https://example.test/Loadout.zip",
  sha256: createHash("sha256").update(BODY).digest("hex"),
  size: BODY.length,
};

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "loadout-download-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

/** A body that sends `bytes` and then either ends or never sends anything again. */
function body(bytes: Buffer, hang: boolean): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(bytes));
      if (!hang) controller.close();
    },
  });
}

interface Request {
  range: string | null;
}

/** Serves `BODY`, honouring Range. The first `stalls` connections hang after `cut` bytes. */
function server(stalls: number, cut = 300) {
  const requests: Request[] = [];
  const fetchImpl = (async (_url: string, init?: RequestInit) => {
    const range = (init?.headers as Record<string, string> | undefined)?.Range ?? null;
    requests.push({ range });
    const start = range ? Number(/bytes=(\d+)-/.exec(range)?.[1]) : 0;
    const rest = BODY.subarray(start);
    const stall = requests.length <= stalls;
    return new Response(body(stall ? rest.subarray(0, cut) : rest, stall), {
      status: range ? 206 : 200,
    });
  }) as typeof fetch;
  return { fetchImpl, requests };
}

function options(fetchImpl: typeof fetch, signal = new AbortController().signal) {
  const progress: number[] = [];
  return {
    progress,
    opts: {
      fetchImpl,
      signal,
      onProgress: (n: number) => progress.push(n),
      stallMs: 50,
      attempts: 3,
    },
  };
}

describe("downloadVerified", () => {
  it("reconnects after a stall and continues where it stopped", async () => {
    const { fetchImpl, requests } = server(1);
    const destination = join(root, FILE.name);
    await downloadVerified(FILE, destination, options(fetchImpl).opts);
    expect(readFileSync(destination)).toEqual(BODY);
    expect(requests.map((r) => r.range)).toEqual([null, "bytes=300-"]);
  });

  it("gives up after the last attempt but keeps what arrived", async () => {
    const { fetchImpl } = server(10);
    const destination = join(root, FILE.name);
    await expect(downloadVerified(FILE, destination, options(fetchImpl).opts)).rejects.toThrow(
      /keeps stalling/,
    );
    expect(readFileSync(`${destination}.part`).length).toBe(900);

    // The next try picks up the 900 bytes and fetches only the rest.
    const next = server(0);
    await downloadVerified(FILE, destination, options(next.fetchImpl).opts);
    expect(next.requests.map((r) => r.range)).toEqual(["bytes=900-"]);
    expect(readFileSync(destination)).toEqual(BODY);
  });

  it("stops at once when cancelled, even on a stuck connection", async () => {
    const { fetchImpl } = server(10);
    const controller = new AbortController();
    const started = Date.now();
    const running = downloadVerified(FILE, join(root, FILE.name), {
      ...options(fetchImpl, controller.signal).opts,
      stallMs: 10_000,
    });
    setTimeout(() => controller.abort(), 20);
    await expect(running).rejects.toBeDefined();
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it("throws away a download that does not match the checksum", async () => {
    const destination = join(root, FILE.name);
    const bad = Buffer.from(BODY).fill(65, 0, 10);
    const fetchImpl = (async () => new Response(new Uint8Array(bad))) as typeof fetch;
    await expect(downloadVerified(FILE, destination, options(fetchImpl).opts)).rejects.toThrow(
      /checksum/,
    );
    expect(existsSync(`${destination}.part`)).toBe(false);
  });

  it("skips a file that is already complete", async () => {
    const destination = join(root, FILE.name);
    writeFileSync(destination, BODY);
    const { fetchImpl, requests } = server(0);
    await downloadVerified(FILE, destination, options(fetchImpl).opts);
    expect(requests).toEqual([]);
  });
});
