import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CLAWHUB_MAX_FILE_BYTES } from "@loadout/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SecretStore } from "../src/context";
import type { Core } from "../src/core";
import { clawhubTopicsOf } from "../src/publish/clawhub";
import { makeSkill, tempDir, createTestCore } from "./helpers";

const TOKEN = "clh_test_token";
/** A token-shaped string the key check recognises and does not take for a documentation example. */
const FAKE_KEY = `ghp_${"aB3dE6gH9jK2mN5pQ8sT1vW4yZ7bC0eF3hJ6"}`;

function memorySecrets(): SecretStore & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    available: () => true,
    get: async (key) => values.get(key) ?? null,
    set: async (key, value) => void values.set(key, value),
    delete: async (key) => void values.delete(key),
  };
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** A registry that knows one token, one published skill, and records what is uploaded. */
function fakeRegistry() {
  const state = {
    uploads: [] as {
      headers: Record<string, string>;
      payload: Record<string, unknown>;
      files: string[];
    }[],
    versions: ["1.2.0", "1.1.0"],
  };
  const fetchImpl = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = new URL(String(input));
    const path = url.pathname.replace("/api/v1", "");
    const headers = { ...(init?.headers as Record<string, string>) };
    if (path === "/whoami") {
      return headers.Authorization === `Bearer ${TOKEN}`
        ? json({ user: { handle: "ada", displayName: "Ada" } })
        : json({ error: "nope" }, 401);
    }
    if (path === "/skills/pdf/versions") {
      return json({ items: state.versions.map((version) => ({ version })), nextCursor: null });
    }
    if (path.endsWith("/versions")) return json({ message: "not found" }, 404);
    if (path === "/skills" && init?.method === "POST") {
      const form = init.body as FormData;
      const files = form.getAll("files").map((file) => (file as File).name);
      state.uploads.push({
        headers,
        payload: JSON.parse(String(form.get("payload"))) as Record<string, unknown>,
        files,
      });
      return json({ ok: true, versionId: "v1", publicationStatus: "pending" });
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
  return { state, fetchImpl };
}

describe("publishing to ClawHub", () => {
  let temp: ReturnType<typeof tempDir>;
  let core: Core;
  let registry: ReturnType<typeof fakeRegistry>;
  let secrets: ReturnType<typeof memorySecrets>;
  beforeEach(() => {
    temp = tempDir();
    registry = fakeRegistry();
    secrets = memorySecrets();
    core = createTestCore({
      homeDir: temp.dir,
      fetchImpl: registry.fetchImpl,
      secrets,
    });
  });
  afterEach(() => {
    core.close();
    temp.cleanup();
  });

  it("keeps a token only after the registry confirms it, and forgets it on request", async () => {
    expect(await core.api.publish.clawhubAccount()).toEqual({
      available: true,
      saved: false,
      handle: null,
      problem: null,
    });
    await expect(core.api.publish.setClawhubToken("wrong")).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
    expect(secrets.values.size).toBe(0);
    expect(await core.api.publish.setClawhubToken(TOKEN)).toMatchObject({
      saved: true,
      handle: "ada",
    });
    expect(secrets.values.get("clawhub.token")).toBe(TOKEN);
    expect(await core.api.publish.setClawhubToken(null)).toMatchObject({ saved: false });
    expect(secrets.values.size).toBe(0);
  });

  it("previews a skill against what is published and uploads a version", async () => {
    await core.api.publish.setClawhubToken(TOKEN);
    const skill = await core.api.install.fromPath(
      makeSkill(join(temp.dir, "src"), "pdf", {
        body: "# PDF\n",
        files: { "scripts/run.sh": "echo hi\n", "node_modules/x.js": "junk" },
      }),
    );
    await core.api.skills.setTags(skill.id, ["PDF tools", "docs", "clawhub"]);
    const preview = await core.api.publish.clawhubPreview(skill.id);
    expect(preview).toMatchObject({
      handle: "ada",
      slug: "pdf",
      latestVersion: "1.2.0",
      suggestedVersion: "1.2.1",
      topics: ["pdf-tools", "docs"],
      problems: [],
      secrets: [],
    });
    expect(preview.files.map((file) => file.path)).toEqual(["SKILL.md", "scripts/run.sh"]);

    await expect(
      core.api.publish.publishToClawhub({
        skillId: skill.id,
        slug: "pdf",
        displayName: "PDF",
        version: "1.2.1",
        changelog: "Fixes",
        acceptLicense: false,
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });

    const result = await core.api.publish.publishToClawhub({
      skillId: skill.id,
      slug: "pdf",
      displayName: "PDF",
      version: "1.2.1",
      changelog: "Fixes",
      acceptLicense: true,
    });
    expect(result).toMatchObject({
      handle: "ada",
      slug: "pdf",
      version: "1.2.1",
      status: "pending",
      pageUrl: "https://clawhub.ai/ada/skills/pdf",
      installCommand: "loadout skills install @ada/pdf",
    });
    const [upload] = registry.state.uploads;
    expect(upload?.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(upload?.payload).toMatchObject({
      slug: "pdf",
      displayName: "PDF",
      version: "1.2.1",
      changelog: "Fixes",
      acceptLicenseTerms: true,
      tags: ["latest"],
      topics: ["pdf-tools", "docs"],
    });
    expect(upload?.files).toEqual(["SKILL.md", "scripts/run.sh"]);
  });

  it("names a file over ClawHub's size limit, read from its size alone", async () => {
    await core.api.publish.setClawhubToken(TOKEN);
    const dir = makeSkill(join(temp.dir, "src"), "big");
    writeFileSync(join(dir, "data.bin"), Buffer.alloc(CLAWHUB_MAX_FILE_BYTES + 1));
    const skill = await core.api.install.fromPath(dir);
    const preview = await core.api.publish.clawhubPreview(skill.id);
    expect(preview.problems).toEqual([
      { code: "file_too_large", file: "data.bin", limitBytes: CLAWHUB_MAX_FILE_BYTES },
    ]);
    expect(preview.files).toContainEqual({ path: "data.bin", bytes: CLAWHUB_MAX_FILE_BYTES + 1 });
  });

  it("holds back a skill that looks like it carries a key, unless allowed", async () => {
    await core.api.publish.setClawhubToken(TOKEN);
    const dir = makeSkill(join(temp.dir, "src"), "leaky");
    mkdirSync(join(dir, "scripts"));
    writeFileSync(join(dir, "scripts", "env.sh"), `export GITHUB_TOKEN=${FAKE_KEY}\n`);
    const skill = await core.api.install.fromPath(dir);
    const preview = await core.api.publish.clawhubPreview(skill.id);
    expect(preview.secrets).toMatchObject([
      { file: "scripts/env.sh", line: 1, kind: "github_token" },
    ]);
    expect(preview.latestVersion).toBeNull();
    expect(preview.suggestedVersion).toBe("1.0.0");
    const input = {
      skillId: skill.id,
      slug: "leaky",
      displayName: "Leaky",
      version: "1.0.0",
      changelog: "",
      acceptLicense: true,
    };
    await expect(core.api.publish.publishToClawhub(input)).rejects.toMatchObject({
      code: "SECRETS_FOUND",
    });
    expect(registry.state.uploads).toHaveLength(0);
    await core.api.publish.publishToClawhub({ ...input, allowSecrets: true });
    expect(registry.state.uploads).toHaveLength(1);
  });

  it("leaves out what Git publishing leaves out, and finds every key", async () => {
    await core.api.publish.setClawhubToken(TOKEN);
    const skill = await core.api.install.fromPath(makeSkill(join(temp.dir, "src"), "envy"));
    const write = (path: string, text: string): void => {
      mkdirSync(join(skill.libraryPath, path, ".."), { recursive: true });
      writeFileSync(join(skill.libraryPath, path), text);
    };
    write(".env.local", "API=1\n");
    write(".env.production", "API=2\n");
    write("logs/run.log", "started\n");
    write(".env.example", "API=\n");
    write("scripts/keys.sh", `A=${FAKE_KEY}\nB=${FAKE_KEY.replace("aB3", "zZ9")}\n`);
    write("docs/aws.md", "Example: AKIAIOSFODNN7EXAMPLE\n");

    const preview = await core.api.publish.clawhubPreview(skill.id);
    expect(preview.files.map((file) => file.path)).toEqual([
      ".env.example",
      "SKILL.md",
      "docs/aws.md",
      "scripts/keys.sh",
    ]);
    expect(preview.secrets.map((found) => [found.file, found.line])).toEqual([
      ["scripts/keys.sh", 1],
      ["scripts/keys.sh", 2],
    ]);
    await expect(
      core.api.publish.publishToClawhub({
        skillId: skill.id,
        slug: "envy",
        displayName: "Envy",
        version: "1.0.0",
        changelog: "",
        acceptLicense: true,
      }),
    ).rejects.toMatchObject({ code: "SECRETS_FOUND" });
    expect(registry.state.uploads).toHaveLength(0);
  });

  it("says plainly when no token is saved", async () => {
    const skill = await core.api.install.fromPath(makeSkill(join(temp.dir, "src"), "pdf"));
    await expect(core.api.publish.clawhubPreview(skill.id)).rejects.toMatchObject({
      code: "UNSUPPORTED",
    });
  });

  it("turns tags into registry topics", () => {
    expect(
      clawhubTopicsOf([
        "Git",
        "code review",
        "official",
        "a".repeat(60),
        "git",
        "x",
        "y",
        "z",
        "w",
      ]),
    ).toEqual(["git", "code-review", "x", "y", "z"]);
  });
});
