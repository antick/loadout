import { join } from "node:path";
import {
  type FoundItem,
  type ItemKind,
  type ItemsApi,
  type LibraryItem,
  isItemKind,
  parseMarkdown,
  textField,
} from "@loadout/shared";
import type { CoreContext } from "../context";
import { invalid } from "../errors";
import type { AgentRegistry } from "../agents/registry";
import type { GitClient } from "../install/git-client";
import { parseGitSource, resolveTreeRef } from "../install/git-source";
import type { ProjectStore } from "../projects/store";
import { isDirectory } from "../util/fs";
import { createItemDeployer, deploymentState } from "./deploy";
import { ItemDeploymentStore } from "./deployments";
import { createItemFinder } from "./find";
import { type StoredItem, assertItemName, createItemLibrary } from "./library";
import { createItemPlacement } from "./placement";
import { itemTemplate } from "./templates";

export interface ItemsService {
  api: ItemsApi;
  /** Bring deployed files up to date after the library changed outside the app (sync, edits). */
  refreshAll(): number;
}

function assertKind(kind: unknown): asserts kind is ItemKind {
  if (!isItemKind(kind)) throw invalid(`Unknown item kind: ${String(kind)}`);
}

export function createItemsService(
  ctx: CoreContext,
  deps: { registry: AgentRegistry; projects: ProjectStore; git: GitClient },
): ItemsService {
  const library = createItemLibrary(ctx.paths.skillsDir);
  const deployments = new ItemDeploymentStore(ctx.db);
  const placement = createItemPlacement({ registry: deps.registry, projects: deps.projects });
  const deployer = createItemDeployer({ placement, deployments });
  const finder = createItemFinder({ library, placement, deployments });

  const view = (item: StoredItem): LibraryItem => ({
    kind: item.kind,
    name: item.name,
    description: textField(parseMarkdown(item.content).fields, "description"),
    hash: item.hash,
    modifiedAt: item.modifiedAt,
    deployments: deployments.forItem(item.kind, item.name).map((record) => ({
      agentKey: record.agentKey,
      projectId: record.projectId,
      path: record.targetPath,
      state: deploymentState(record, item.hash),
    })),
  });

  const changed = (): void => ctx.touched("items");

  const findInRepository = async (url: string): Promise<FoundItem[]> => {
    let source = parseGitSource(url);
    if (source.treeTail) {
      const split = await resolveTreeRef(source.cloneUrl, source.treeTail, (remote) =>
        deps.git.listRefs(remote),
      );
      source = { ...source, ...split, treeTail: null };
    }
    const checkout = await deps.git.checkout(source.cloneUrl, { branch: source.branch });
    try {
      const root = source.subpath ? join(checkout.dir, ...source.subpath.split("/")) : checkout.dir;
      if (!isDirectory(root)) throw invalid(`The repository has no folder ${source.subpath}.`);
      return finder.inFolder(root);
    } finally {
      await checkout.cleanup();
    }
  };

  const api: ItemsApi = {
    list: async (kind) => {
      if (kind !== undefined) assertKind(kind);
      return library.list(kind).map(view);
    },
    get: async (ref) => {
      assertKind(ref.kind);
      const item = library.get(ref.kind, ref.name);
      return { ...view(item), content: item.content, path: item.path };
    },
    create: async (ref, content) => {
      assertKind(ref.kind);
      assertItemName(ref.name);
      const item = await ctx.lock.run("create an item", () =>
        library.create(ref.kind, ref.name, content ?? itemTemplate(ref.kind, ref.name)),
      );
      changed();
      return view(item);
    },
    save: async (ref, input) => {
      assertKind(ref.kind);
      const item = await ctx.lock.run("save an item", () => {
        const saved = library.save(
          ref.kind,
          ref.name,
          input.content,
          input.baseHash,
          input.overwrite,
        );
        deployer.refresh(saved);
        return saved;
      });
      changed();
      return view(item);
    },
    remove: async (ref) => {
      assertKind(ref.kind);
      const result = await ctx.lock.run("remove an item", () => {
        library.get(ref.kind, ref.name);
        const outcome = deployer.undeployAll(ref.kind, ref.name);
        library.remove(ref.kind, ref.name);
        return outcome;
      });
      changed();
      return result;
    },
    places: async (kind) => {
      assertKind(kind);
      return placement.places(kind);
    },
    preview: async (ref, place) => {
      assertKind(ref.kind);
      return deployer.preview(library.get(ref.kind, ref.name), place);
    },
    deploy: async (ref, place, options) => {
      assertKind(ref.kind);
      const item = await ctx.lock.run("deploy an item", () => {
        const stored = library.get(ref.kind, ref.name);
        deployer.deploy(stored, place, options);
        return stored;
      });
      changed();
      return view(item);
    },
    undeploy: async (ref, place) => {
      assertKind(ref.kind);
      const result = await ctx.lock.run("undeploy an item", () =>
        deployer.undeploy(ref.kind, ref.name, place),
      );
      changed();
      return result;
    },
    find: async (source) => {
      if (source.type === "agents") return finder.inAgents();
      if (source.type === "folder") {
        if (!isDirectory(source.path)) throw invalid(`No folder at ${source.path}`);
        return finder.inFolder(source.path);
      }
      return findInRepository(source.url);
    },
    importItems: async (items, options = {}) => {
      for (const item of items) {
        assertKind(item.kind);
        assertItemName(item.name);
      }
      const result = await ctx.lock.run("import items", () => {
        const outcome = { imported: [], replaced: [], skipped: [] } as Awaited<
          ReturnType<ItemsApi["importItems"]>
        >;
        for (const input of items) {
          const ref = { kind: input.kind, name: input.name };
          const existing = library.find(input.kind, input.name);
          if (!existing) {
            library.create(input.kind, input.name, input.content);
            outcome.imported.push(ref);
          } else if (options.replace) {
            deployer.refresh(library.save(input.kind, input.name, input.content, existing.hash));
            outcome.replaced.push(ref);
          } else {
            outcome.skipped.push(ref);
          }
        }
        return outcome;
      });
      changed();
      return result;
    },
  };

  return {
    api,
    refreshAll: () => library.list().reduce((written, item) => written + deployer.refresh(item), 0),
  };
}
