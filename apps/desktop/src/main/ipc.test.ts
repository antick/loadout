import { AppError } from "@loadout/core";
import { type ApiResponse, IPC_INVOKE_CHANNEL, type LoadoutApi } from "@loadout/shared";
import { type Mock, beforeEach, describe, expect, it, vi } from "vitest";
import { registerIpc } from "./ipc";

type InvokeHandler = (event: unknown, channel: string, args: unknown) => Promise<unknown>;

const handlers = new Map<string, InvokeHandler>();

vi.mock("electron", () => ({
  ipcMain: {
    handle: (channel: string, handler: InvokeHandler) => handlers.set(channel, handler),
  },
}));

const APP_URL = "app://loadout/index.html";

interface Frame {
  url: string;
  parent: Frame | null;
}

const mainFrame = (url = APP_URL): Frame => ({ url, parent: null });

/** What the renderer gets back for `channel(...args)` asked from `frame`. */
async function invoke(
  channel: string,
  args: unknown = [],
  frame: Frame | null = mainFrame(),
): Promise<ApiResponse<unknown>> {
  const handler = handlers.get(IPC_INVOKE_CHANNEL);
  if (!handler) throw new Error("registerIpc did not register the invoke channel");
  return (await handler({ senderFrame: frame }, channel, args)) as ApiResponse<unknown>;
}

let list: Mock<(...args: unknown[]) => Promise<{ args: unknown[] }>>;
let onError: Mock<(channel: string, error: unknown) => void>;
let refuse: Mock<(namespace: string) => Error | null>;

beforeEach(() => {
  handlers.clear();
  list = vi.fn(async (...args: unknown[]) => ({ args }));
  onError = vi.fn();
  refuse = vi.fn(() => null);
  const api = {
    skills: {
      list,
      fail: async () => {
        throw new Error("disk on fire");
      },
      missing: async () => {
        throw new AppError("NOT_FOUND", "No such skill", { id: "pdf" });
      },
      notAFunction: 42,
    },
    app: { version: async () => "1.0.0" },
  } as unknown as LoadoutApi;
  registerIpc(api, onError, refuse, (url) => url.startsWith("app://loadout/"));
});

const refused = (message: string | RegExp) => ({
  ok: false,
  error: expect.objectContaining({ code: "INTERNAL", message: expect.stringMatching(message) }),
});

describe("IPC gate", () => {
  it("calls the method with the arguments and returns its value", async () => {
    expect(await invoke("skills.list", ["a", 1])).toEqual({ ok: true, value: { args: ["a", 1] } });
    expect(list).toHaveBeenCalledWith("a", 1);
  });

  it("calls with no arguments when the renderer sends something other than a list", async () => {
    expect(await invoke("skills.list", { length: 2, 0: "x" })).toEqual({
      ok: true,
      value: { args: [] },
    });
  });

  it("refuses a call from a subframe of the app's own page", async () => {
    const sub = { url: APP_URL, parent: mainFrame() };
    expect(await invoke("skills.list", [], sub)).toEqual(refused(/^Refused an API call from/));
    expect(list).not.toHaveBeenCalled();
  });

  it("refuses a main frame showing a foreign page", async () => {
    const response = await invoke("skills.list", [], mainFrame("https://evil.test/"));
    expect(response).toEqual(refused("https://evil.test/"));
    expect(list).not.toHaveBeenCalled();
  });

  it("refuses a call without a sender frame (the frame is gone)", async () => {
    expect(await invoke("skills.list", [], null)).toEqual(refused("an unknown page"));
  });

  it("refuses a namespace that is not in the allow-list", async () => {
    for (const channel of [
      "shell.openExternal",
      "constructor.name",
      "skills",
      ".list",
      "skills.",
    ]) {
      expect(await invoke(channel)).toEqual(refused(/^Unknown API channel/));
    }
  });

  it("refuses inherited and prototype names as methods", async () => {
    for (const method of ["toString", "constructor", "__proto__", "hasOwnProperty", "valueOf"]) {
      expect(await invoke(`skills.${method}`)).toEqual(
        refused(`Unknown API channel: skills.${method}`),
      );
    }
  });

  it("refuses a property that is not a function", async () => {
    expect(await invoke("skills.notAFunction")).toEqual(refused(/^Unknown API channel/));
  });

  it("answers a refused namespace with the refusal, without calling the method", async () => {
    refuse.mockImplementation((namespace: string) =>
      namespace === "skills" ? new AppError("BUSY", "Closing.") : null,
    );
    expect(await invoke("skills.list")).toEqual({
      ok: false,
      error: { code: "BUSY", message: "Closing.", details: undefined },
    });
    expect(list).not.toHaveBeenCalled();
    expect(await invoke("app.version")).toEqual({ ok: true, value: "1.0.0" });
    expect(refuse).toHaveBeenCalledWith("app");
  });

  it("passes an AppError through as its code, message and details, without reporting it", async () => {
    expect(await invoke("skills.missing")).toEqual({
      ok: false,
      error: { code: "NOT_FOUND", message: "No such skill", details: { id: "pdf" } },
    });
    expect(onError).not.toHaveBeenCalled();
  });

  it("reports an unexpected error and answers with INTERNAL", async () => {
    expect(await invoke("skills.fail")).toEqual({
      ok: false,
      error: { code: "INTERNAL", message: "disk on fire" },
    });
    expect(onError).toHaveBeenCalledWith("skills.fail", expect.any(Error));
  });
});
