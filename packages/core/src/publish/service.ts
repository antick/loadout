import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  APP_NAME,
  type PublishApi,
  type PublishInput,
  type PublishPlan,
  type PublishResult,
  type PublishTarget,
  type Skill,
  installCommand,
  repositoryLabel,
} from "@loadout/shared";
import type { CoreContext } from "../context";
import { type ClawhubClient, createClawhubClient } from "../market/clawhub";
import { createClawhubPublisher } from "./clawhub";
import { AppError, invalid, isAppError } from "../errors";
import { INTERNAL_KEYS } from "../settings/store";
import type { SkillStore } from "../skills/store";
import { writeAndCommit } from "./apply";
import { secretsHeldBack } from "./files";
import { type Checkout, openCheckout } from "./checkout";
import { type Planned, planSkills } from "./plan";
import { type ResolvedTarget, publishCacheRoot, resolveTarget } from "./target";
import { dirSize, readDirSafe, removePathSync } from "../util/fs";

export interface PublishDeps {
  store: SkillStore;
  hooks?: PublishHooks;
  /** The registry client, for publishing to ClawHub. Absent in tests of the Git side. */
  clawhub?: ClawhubClient;
}

/** Seams for tests that need to act in a race window. Unused in the app. */
export interface PublishHooks {
  /** Runs after the commit and right before each push attempt. */
  beforePush?: (attempt: number) => Promise<void> | void;
}

export interface PublishService {
  api: PublishApi;
  /**
   * Delete every publishing working copy, each once nothing publishes to it: they are clones,
   * made again on the next publish. Returns the bytes freed.
   */
  clearWorkingCopies(): Promise<number>;
}

/** A push refused because the branch moved is tried again from the new state, this many times. */
const MAX_PUSH_ATTEMPTS = 3;
const GITHUB_LABEL_HOST = "github.com";
const SINGLE_SKILL_REPO =
  "This repository is a single skill (it has a SKILL.md at the top). Publish to a repository made for several skills, or an empty one.";

/** Publishes to one repository at a time: they share a working copy. */
const queues = new Map<string, Promise<unknown>>();

function serialized<T>(key: string, work: () => Promise<T>): Promise<T> {
  const run = (queues.get(key) ?? Promise.resolve()).then(work, work);
  const tail = run.catch(() => undefined);
  queues.set(key, tail);
  void tail.then(() => {
    if (queues.get(key) === tail) queues.delete(key);
  });
  return run;
}

/** Git's own wording talks about "the backup remote"; this is not a backup. */
function publishError(error: unknown): unknown {
  if (!(error instanceof AppError)) return error;
  if (error.code === "GIT_AUTH") {
    return new AppError(
      "GIT_AUTH",
      "The repository refused the sign-in. Publishing uses the token saved for its host in Settings → Backup, your SSH key, or your Git credential helper, and it needs permission to write.",
    );
  }
  if (error.code === "NETWORK") {
    return new AppError(
      "NETWORK",
      "Could not reach the repository. Check your internet connection and proxy setting.",
    );
  }
  if (error.code === "GIT_REJECTED") {
    return new AppError(
      "GIT_REJECTED",
      "The repository did not accept the push. The branch may be protected, or it changed while publishing. Try again, or publish to another branch.",
    );
  }
  return error;
}

/** How people install from the repository: `owner/repo` on GitHub, the address elsewhere. */
function installSource(target: ResolvedTarget): string | null {
  if (target.remote.kind === "local") return null;
  const label = repositoryLabel(target.url);
  return target.remote.host === GITHUB_LABEL_HOST ? label : target.url;
}

/** A repository that is one skill itself (`SKILL.md` at the top) is not a place to add others. */
const hasTopLevelSkill = (checkout: Checkout): boolean =>
  existsSync(join(checkout.dir, "SKILL.md"));

function refuseSingleSkillRepo(checkout: Checkout): void {
  if (!checkout.repoEmpty && hasTopLevelSkill(checkout)) throw invalid(SINGLE_SKILL_REPO);
}

function toPlan(target: ResolvedTarget, checkout: Checkout, planned: Planned): PublishPlan {
  return {
    target: { repo: target.url, branch: checkout.branch, layer: target.layer },
    repoEmpty: checkout.repoEmpty,
    newBranch: checkout.newBranch && !checkout.repoEmpty,
    skills: planned.skills.map(({ plan }) => plan),
    secrets: planned.secrets,
  };
}

export function createPublishService(ctx: CoreContext, deps: PublishDeps): PublishService {
  const clawhub = createClawhubPublisher(ctx, {
    store: deps.store,
    clawhub: deps.clawhub ?? createClawhubClient(),
  });
  function chosenSkills(ids: readonly string[]): Skill[] {
    const unique = [...new Set(ids)];
    if (unique.length === 0) throw invalid("Choose at least one skill to publish.");
    return unique.map((id) => deps.store.get(id));
  }

  async function preview(input: PublishInput): Promise<PublishPlan> {
    const skills = chosenSkills(input.skillIds);
    const target = resolveTarget(ctx, input);
    return serialized(target.cacheDir, async () => {
      try {
        const checkout = await openCheckout(ctx, target);
        refuseSingleSkillRepo(checkout);
        return toPlan(target, checkout, planSkills(skills, checkout.dir, target));
      } catch (error) {
        throw publishError(error);
      }
    });
  }

  async function publish(input: PublishInput): Promise<PublishResult> {
    const skills = chosenSkills(input.skillIds);
    const target = resolveTarget(ctx, input);
    return serialized(target.cacheDir, async () => {
      try {
        for (let attempt = 1; ; attempt += 1) {
          const checkout = await openCheckout(ctx, target);
          refuseSingleSkillRepo(checkout);
          // One look at the library: what is checked for keys is what gets copied.
          const step = await ctx.lock.run("publish skills", async () => {
            const planned = planSkills(skills, checkout.dir, target);
            if (planned.secrets.length > 0 && !input.allowSecrets) {
              throw secretsHeldBack(planned.secrets);
            }
            return { planned, commit: await writeAndCommit(checkout, planned.skills) };
          });
          const plan = toPlan(target, checkout, step.planned);
          if (step.commit) {
            try {
              await deps.hooks?.beforePush?.(attempt);
              await checkout.run(["push", "origin", `HEAD:refs/heads/${checkout.branch}`], true);
            } catch (error) {
              if (isAppError(error, "GIT_REJECTED") && attempt < MAX_PUSH_ATTEMPTS) continue;
              throw error;
            }
          }
          return finish(input, target, checkout, plan, step.commit);
        }
      } catch (error) {
        throw publishError(error);
      }
    });
  }

  function finish(
    input: PublishInput,
    target: ResolvedTarget,
    checkout: Checkout,
    plan: PublishPlan,
    commit: string | null,
  ): PublishResult {
    const names = (status: "new" | "changed" | "unchanged"): string[] =>
      plan.skills.filter((skill) => skill.status === status).map((skill) => skill.name);
    const published = [...names("new"), ...names("changed")];
    const unchanged = names("unchanged");
    const source = installSource(target);
    // `npx skills add` reads the default branch unless told otherwise.
    const onDefault = checkout.branch === checkout.defaultBranch || checkout.repoEmpty;
    const installCommands =
      source && onDefault
        ? [...published, ...unchanged].map((name) => installCommand(source, name))
        : [];
    const saved: PublishTarget = {
      repo: target.url,
      branch: input.branch?.trim() || null,
      layer: target.layer,
    };
    ctx.settings.setRaw(INTERNAL_KEYS.publishTarget, saved);
    if (published.length > 0) {
      ctx.activity.record(
        "publish",
        published.join(", "),
        `Published to ${repositoryLabel(target.url)}`,
      );
    }
    ctx.log.info(
      `${APP_NAME} published ${published.length} skill(s) to ${repositoryLabel(target.url)}`,
    );
    ctx.touched("settings");
    return { plan, commit, published, unchanged, installCommands };
  }

  async function clearWorkingCopies(): Promise<number> {
    let freed = 0;
    for (const entry of readDirSafe(publishCacheRoot(ctx))) {
      const dir = join(publishCacheRoot(ctx), entry.name);
      // Through the same queue as a publish to it: one running finishes first.
      await serialized(dir, async () => {
        freed += dirSize(dir);
        removePathSync(dir);
      });
    }
    return freed;
  }

  return {
    clearWorkingCopies,
    api: {
      defaults: async () =>
        ctx.settings.getRaw<PublishTarget | null>(INTERNAL_KEYS.publishTarget, null),
      preview,
      publish,
      clawhubAccount: clawhub.account,
      setClawhubToken: clawhub.setToken,
      clawhubPreview: clawhub.preview,
      publishToClawhub: clawhub.publish,
    },
  };
}
