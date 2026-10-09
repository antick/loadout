import { appendFileSync, existsSync, mkdirSync, readdirSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { createRequest } from "../src/install/download";
import { createClawhubClient } from "../src/market/clawhub";
import { type PublishService, createPublishService } from "../src/publish";
import { type DeployWorld, createDeployWorld } from "./deploy-world";
import { rejection, writeFile } from "./helpers";
import { commitAll, git, initRepo } from "./install-fixtures";

let world: DeployWorld;
let remote: string;
let service: PublishService;

beforeEach(() => {
  world = createDeployWorld();
  remote = join(world.root, "remotes", "skills.git");
  mkdirSync(remote, { recursive: true });
  git(remote, "init", "--quiet", "--bare", "--initial-branch=main");
  service = createPublishService(world.ctx, {
    store: world.store,
    clawhub: createClawhubClient(createRequest()),
  });
});
afterEach(() => {
  world.cleanup();
});

// Windows checks links out as plain files unless symlinks are enabled.
it.skipIf(process.platform === "win32")(
  "never writes through a link the repository holds to a folder outside it",
  async () => {
    const victim = join(world.root, "victim");
    writeFile(join(victim, "pdf", "keep.txt"), "mine\n");
    const seed = initRepo(join(world.root, "seed"));
    symlinkSync(victim, join(seed, "skills"));
    commitAll(seed, "start");
    git(seed, "push", "--quiet", remote, "main");

    const pdf = world.addSkill("pdf");
    const error = await rejection(service.api.publish({ skillIds: [pdf.id], repo: remote }));

    expect(error.code).toBe("INVALID_INPUT");
    expect(existsSync(join(victim, "pdf", "keep.txt"))).toBe(true);
    expect(existsSync(join(victim, "pdf", "SKILL.md"))).toBe(false);
  },
);

it.skipIf(process.platform === "win32")(
  "reuses its working copy when the user's git rewrites the address",
  async () => {
    // Another spelling of the same repository, which the user's config turns the address into.
    const alias = join(world.root, "remotes", "alias.git");
    symlinkSync(remote, alias);
    appendFileSync(
      process.env.GIT_CONFIG_GLOBAL ?? "",
      `[url "${alias}"]\n\tinsteadOf = ${remote}\n`,
    );
    const pdf = world.addSkill("pdf");
    await service.api.publish({ skillIds: [pdf.id], repo: remote });
    const publishDir = join(world.ctx.paths.cacheDir, "publish");
    const [slot] = readdirSync(publishDir);
    const marker = join(publishDir, slot ?? "", ".git", "kept-by-test");
    appendFileSync(marker, "");

    writeFile(join(pdf.libraryPath, "more.md"), "more\n");
    const result = await service.api.publish({ skillIds: [pdf.id], repo: remote });

    expect(result.published).toEqual(["pdf"]);
    expect(existsSync(marker)).toBe(true);
  },
);
