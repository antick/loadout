import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { CLAWHUB_API_URL, MARKETPLACE_URL } from "@loadout/shared";
import { createRepository, remotePath, writeFiles } from "./files.ts";
import {
  CLAWHUB_HANDLE,
  CLAWHUB_REFUSED_TOKEN,
  CLAWHUB_SKILLS,
  type ClawhubFixture,
  GITHUB_LOGIN,
  GITHUB_PUBLIC_REPOSITORIES,
  MARKET_CATALOGUE,
} from "./fixtures-web.ts";
import type { World } from "./world.ts";

/**
 * The `fetchImpl` core gets in the preview: skills.sh, ClawHub and the GitHub API answer from
 * `fixtures-web.ts` and the world's repositories. Anything else is a 404, as if offline.
 */
const GITHUB_API = "https://api.github.com";
const BOARD_SIZE = 20;
const MARKET_BOARDS = new Set(["/", "/hot", "/trending"]);
const SCAN_CHECKED_AT = Date.parse("2026-09-01T09:00:00Z");

type Route = (url: URL, init: RequestInit, world: World) => Response | null;

const json = (body: unknown, status = 200): Response => Response.json(body, { status });
const notFound = (): Response => json({ message: "Not found" }, 404);

function matches(query: string, ...fields: string[]): boolean {
  const text = fields.join(" ").toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => text.includes(word));
}

const skillsSh: Route = (url) => {
  if (url.origin !== MARKETPLACE_URL) return null;
  if (url.pathname === "/api/search") {
    const query = url.searchParams.get("q") ?? "";
    const limit = Number(url.searchParams.get("limit")) || MARKET_CATALOGUE.length;
    const found = MARKET_CATALOGUE.filter((entry) =>
      matches(query, entry.source, entry.skillId, entry.name),
    );
    return json({ skills: found.slice(0, limit) });
  }
  if (!MARKET_BOARDS.has(url.pathname)) return notFound();
  const data = { props: { pageProps: { initialSkills: MARKET_CATALOGUE.slice(0, BOARD_SIZE) } } };
  const html = `<html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script></body></html>`;
  return new Response(html, { headers: { "content-type": "text/html" } });
};

function clawhubEntry(skill: ClawhubFixture) {
  return {
    slug: skill.slug,
    displayName: skill.displayName,
    summary: skill.summary,
    ownerHandle: skill.owner,
    stats: { downloads: skill.downloads },
    latestVersion: { version: skill.versions[0] },
  };
}

/** The skill's files as a gzipped tarball, the way the registry hands out a version. */
function tarball(world: World, skill: ClawhubFixture): Response {
  const dir = mkdtempSync(join(world.live, "tmp", "clawhub-"));
  try {
    writeFiles(dir, skill.files);
    const data = execFileSync("tar", ["-czf", "-", "-C", dir, "."]);
    return new Response(new Uint8Array(data), { headers: { "content-type": "application/gzip" } });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const clawhub: Route = (url, init, world) => {
  if (!url.href.startsWith(CLAWHUB_API_URL)) return null;
  const path = url.pathname.slice(new URL(CLAWHUB_API_URL).pathname.length);
  const token = new Headers(init.headers).get("authorization")?.replace(/^Bearer /, "");
  if (path === "/whoami") {
    return token === CLAWHUB_REFUSED_TOKEN
      ? json({}, 401)
      : json({ user: { handle: CLAWHUB_HANDLE } });
  }
  if (path === "/skills" && init.method === "POST") return json({ publicationStatus: "published" });
  if (path === "/skills") return json({ items: CLAWHUB_SKILLS.map(clawhubEntry) });
  if (path === "/search") {
    const query = url.searchParams.get("q") ?? "";
    const found = CLAWHUB_SKILLS.filter((skill) => matches(query, skill.slug, skill.summary));
    return json({ results: found.map(clawhubEntry) });
  }
  const owner = url.searchParams.get("owner") ?? url.searchParams.get("ownerHandle");
  // `/skills/<slug>`, `/skills/<slug>/versions` or `/scan`; a download names it in the query.
  const [, pathSlug, part] = path.match(/^\/skills\/([^/]+)\/?(\w*)$/) ?? [];
  const slug = pathSlug ?? url.searchParams.get("slug");
  const skill = CLAWHUB_SKILLS.find(
    (entry) => entry.slug === slug && (!owner || entry.owner === owner),
  );
  if (!skill) return notFound();
  if (path === "/download") return tarball(world, skill);
  if (part === "versions") return json({ items: skill.versions.map((version) => ({ version })) });
  if (part === "scan") {
    const scanners = { static: { analysis: "No suspicious patterns found." } };
    return json({
      security: { status: "clean", scanners, checkedAt: SCAN_CHECKED_AT },
      moderation: {},
    });
  }
  return json({
    skill: {
      slug: skill.slug,
      displayName: skill.displayName,
      description: skill.files["SKILL.md"],
    },
    owner: { handle: skill.owner },
    latestVersion: { version: skill.versions[0], changelog: skill.changelog },
  });
};

/** GitHub's API for connecting a backup: one account, its repositories in the world. */
const github: Route = (url, init, world) => {
  if (url.origin !== GITHUB_API) return null;
  if (url.pathname === "/user") return json({ login: GITHUB_LOGIN });
  if (url.pathname === "/user/repos" && init.method === "POST") {
    const { name } = JSON.parse(String(init.body)) as { name: string };
    createRepository(world, `https://github.com/${GITHUB_LOGIN}/${name}`);
    return json({ full_name: `${GITHUB_LOGIN}/${name}`, private: true, size: 0 }, 201);
  }
  const [, owner, name, rest] = url.pathname.match(/^\/repos\/([^/]+)\/([^/]+)(\/.*)?$/) ?? [];
  if (!owner || !name || !existsSync(remotePath(world, `https://github.com/${owner}/${name}`))) {
    return notFound();
  }
  // An empty repository answers 409 for its commits, as GitHub does.
  if (rest === "/commits") return json({ message: "Git Repository is empty." }, 409);
  const isPublic = GITHUB_PUBLIC_REPOSITORIES.includes(name);
  return json({ full_name: `${owner}/${name}`, private: !isPublic, size: 0 });
};

const ROUTES: Route[] = [skillsSh, clawhub, github];

export function createFixtureFetch(world: World): typeof fetch {
  return async (input, init = {}) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    for (const route of ROUTES) {
      const response = route(url, init, world);
      if (response) return response;
    }
    return notFound();
  };
}
