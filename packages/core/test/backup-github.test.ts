import { readFileSync } from "node:fs";
import { join } from "node:path";
import { APP_SLUG } from "@skillboard/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GITHUB_TOKEN_KEY } from "../src/backup/credentials";
import { INTERNAL_KEYS } from "../src/settings/store";
import { type Device, createDevice, isolateGit, memorySecrets } from "./backup-world";
import { tempDir } from "./helpers";

interface Call {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string;
}

interface Route {
  status: number;
  body?: unknown;
}

/** A `fetch` that answers from a table of `METHOD url` → reply, and records what was asked. */
function stubFetch(routes: Record<string, Route | Route[]>): {
  fetchImpl: typeof fetch;
  calls: Call[];
} {
  const calls: Call[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({
      method,
      url,
      headers: { ...(init?.headers as Record<string, string>) },
      body: init?.body ? String(init.body) : "",
    });
    const route = routes[`${method} ${url}`];
    const reply = Array.isArray(route) ? route.shift() : route;
    if (!reply) throw new TypeError(`fetch failed: no route for ${method} ${url}`);
    return new Response(reply.body === undefined ? null : JSON.stringify(reply.body), {
      status: reply.status,
    });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

const API = "https://api.github.com";
const TOKEN = "ghp_exampletoken";
const CLIENT_ID_ENV = `${APP_SLUG.toUpperCase()}_GITHUB_CLIENT_ID`;

describe("GitHub connect", () => {
  let temp: ReturnType<typeof tempDir>;
  let device: Device | null = null;

  beforeEach(() => {
    temp = tempDir();
    isolateGit(temp.dir);
  });
  afterEach(() => {
    device?.close();
    device = null;
    temp.cleanup();
    delete process.env[CLIENT_ID_ENV];
  });

  it("creates a private repository, stores the token only in the secret store", async () => {
    const { fetchImpl, calls } = stubFetch({
      [`GET ${API}/user`]: { status: 200, body: { login: "octo" } },
      [`GET ${API}/repos/octo/my-backup`]: { status: 404, body: {} },
      [`POST ${API}/user/repos`]: {
        status: 201,
        body: { full_name: "octo/my-backup", private: true, size: 0 },
      },
    });
    device = createDevice(temp.dir, "A", { fetchImpl });
    await device.api.init();

    const result = await device.api.githubConnect(` ${TOKEN} `, "my-backup");

    expect(result).toEqual({
      url: "https://github.com/octo/my-backup.git",
      login: "octo",
      repoCreated: true,
      repoPrivate: true,
      remoteHasContent: false,
    });
    const create = calls.find((call) => call.method === "POST");
    expect(JSON.parse(create?.body ?? "{}")).toMatchObject({
      name: "my-backup",
      private: true,
      auto_init: false,
    });
    expect(calls[0]?.headers).toMatchObject({
      Authorization: `Bearer ${TOKEN}`,
      Accept: "application/vnd.github+json",
    });
    expect(device.secrets.values.get(GITHUB_TOKEN_KEY)).toBe(TOKEN);
    expect(await device.api.githubAuthMethod()).toBe("pat");
    expect(device.ctx.settings.getRaw(INTERNAL_KEYS.backupRemoteUrl, "")).toBe(result.url);
    const config = readFileSync(join(device.skillsDir, ".git", "config"), "utf8");
    expect(config).toContain(result.url);
    expect(config).not.toContain(TOKEN);
    expect(JSON.stringify(device.ctx.settings.all())).not.toContain(TOKEN);

    await device.api.removeRemote();
    expect(device.secrets.values.has(GITHUB_TOKEN_KEY)).toBe(false);
    expect(await device.api.githubAuthMethod()).toBeNull();
  });

  it("reuses an existing repository and notices that it has content", async () => {
    const { fetchImpl } = stubFetch({
      [`GET ${API}/user`]: { status: 200, body: { login: "octo" } },
      [`GET ${API}/repos/octo/backup`]: {
        status: 200,
        body: { full_name: "octo/backup", private: false, size: 0 },
      },
      [`GET ${API}/repos/octo/backup/commits?per_page=1`]: { status: 200, body: [{ sha: "abc" }] },
    });
    device = createDevice(temp.dir, "A", { fetchImpl });
    // Not a repository yet: the remote is remembered for the clone that follows.
    const result = await device.api.githubConnect(TOKEN, "backup");
    expect(result).toMatchObject({
      repoCreated: false,
      repoPrivate: false,
      remoteHasContent: true,
    });
    expect(device.ctx.settings.getRaw(INTERNAL_KEYS.backupRemoteUrl, "")).toBe(result.url);
  });

  it("reads an empty existing repository as empty", async () => {
    const { fetchImpl } = stubFetch({
      [`GET ${API}/user`]: { status: 200, body: { login: "octo" } },
      [`GET ${API}/repos/octo/backup`]: {
        status: 200,
        body: { full_name: "octo/backup", size: 0 },
      },
      [`GET ${API}/repos/octo/backup/commits?per_page=1`]: {
        status: 409,
        body: { message: "empty" },
      },
    });
    device = createDevice(temp.dir, "A", { fetchImpl });
    expect(await device.api.githubConnect(TOKEN, "backup")).toMatchObject({
      repoPrivate: true,
      remoteHasContent: false,
    });
  });

  it("maps GitHub's refusals to our error codes", async () => {
    const badToken = stubFetch({ [`GET ${API}/user`]: { status: 401, body: {} } });
    device = createDevice(temp.dir, "A", { fetchImpl: badToken.fetchImpl });
    await expect(device.api.githubConnect(TOKEN, "backup")).rejects.toMatchObject({
      code: "GITHUB_TOKEN_INVALID",
    });
    expect(device.secrets.values.size).toBe(0);
    await expect(device.api.githubConnect(TOKEN, "bad name!")).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
    device.close();

    const noScope = stubFetch({
      [`GET ${API}/user`]: { status: 200, body: { login: "octo" } },
      [`GET ${API}/repos/octo/backup`]: { status: 404, body: {} },
      [`POST ${API}/user/repos`]: { status: 403, body: {} },
    });
    device = createDevice(temp.dir, "B", { fetchImpl: noScope.fetchImpl });
    await expect(device.api.githubConnect(TOKEN, "backup")).rejects.toMatchObject({
      code: "GITHUB_SCOPE",
    });
    expect(device.secrets.values.size).toBe(0);
    device.close();

    const offline = stubFetch({});
    device = createDevice(temp.dir, "C", { fetchImpl: offline.fetchImpl });
    await expect(device.api.githubConnect(TOKEN, "backup")).rejects.toMatchObject({
      code: "NETWORK",
    });
  });

  it("does nothing on GitHub when the token could not be kept safely", async () => {
    const { fetchImpl, calls } = stubFetch({});
    device = createDevice(temp.dir, "A", { fetchImpl, secrets: memorySecrets(false) });
    await expect(device.api.githubConnect(TOKEN, "backup")).rejects.toMatchObject({
      code: "CREDENTIALS_UNAVAILABLE",
    });
    expect(calls).toEqual([]);
  });

  it("runs the device flow without ever returning the token", async () => {
    const tokenUrl = "POST https://github.com/login/oauth/access_token";
    const { fetchImpl, calls } = stubFetch({
      "POST https://github.com/login/device/code": {
        status: 200,
        body: {
          device_code: "dev-123",
          user_code: "ABCD-1234",
          verification_uri: "https://github.com/login/device",
          interval: 5,
        },
      },
      [tokenUrl]: [
        { status: 200, body: { error: "authorization_pending" } },
        { status: 200, body: { error: "slow_down" } },
        { status: 200, body: { access_token: "gho_devicetoken", token_type: "bearer" } },
      ],
      [`GET ${API}/user`]: { status: 200, body: { login: "octo" } },
      [`GET ${API}/repos/octo/backup`]: { status: 404, body: {} },
      [`POST ${API}/user/repos`]: {
        status: 201,
        body: { full_name: "octo/backup", private: true },
      },
    });
    device = createDevice(temp.dir, "A", { fetchImpl });

    expect(await device.api.githubDeviceAvailable()).toBe(false);
    await expect(device.api.githubDeviceStart()).rejects.toMatchObject({
      code: "GITHUB_NOT_CONFIGURED",
    });

    device.ctx.settings.set("githubClientId", "client-abc");
    expect(await device.api.githubDeviceAvailable()).toBe(true);
    const start = await device.api.githubDeviceStart();
    expect(start).toEqual({
      deviceCode: "dev-123",
      userCode: "ABCD-1234",
      verificationUri: "https://github.com/login/device",
      expiresIn: 900,
      interval: 5,
    });
    expect(calls[0]?.body).toBe("client_id=client-abc&scope=repo");

    expect(await device.api.githubDevicePoll("dev-123", "backup")).toEqual({
      status: "pending",
      result: null,
    });
    expect((await device.api.githubDevicePoll("dev-123", "backup")).status).toBe("slow_down");
    const done = await device.api.githubDevicePoll("dev-123", "backup");
    expect(done.status).toBe("connected");
    expect(done.result?.url).toBe("https://github.com/octo/backup.git");
    expect(JSON.stringify(done)).not.toContain("gho_devicetoken");
    expect(device.secrets.values.get(GITHUB_TOKEN_KEY)).toBe("gho_devicetoken");
    expect(await device.api.githubAuthMethod()).toBe("oauth");
    expect(calls.find((call) => call.url.endsWith("/access_token"))?.body).toContain(
      "grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Adevice_code",
    );
  });

  it("reports an expired or refused device sign-in", async () => {
    const { fetchImpl } = stubFetch({
      "POST https://github.com/login/oauth/access_token": [
        { status: 200, body: { error: "expired_token" } },
        { status: 200, body: { error: "access_denied" } },
      ],
    });
    device = createDevice(temp.dir, "A", { fetchImpl });
    process.env[CLIENT_ID_ENV] = "from-env";
    expect(await device.api.githubDeviceAvailable()).toBe(true);
    await expect(device.api.githubDevicePoll("d", "backup")).rejects.toMatchObject({
      code: "GITHUB_DEVICE_EXPIRED",
    });
    await expect(device.api.githubDevicePoll("d", "backup")).rejects.toMatchObject({
      code: "GITHUB_DEVICE_DENIED",
    });
  });
});
