/**
 * One preview session: the real core on a seeded temporary home, driven by the dev server
 * (`../plugin.ts`) over the process channel. Started with the session's name as its argument.
 */
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { type Core, createCore, toErrorShape } from "@loadout/core";
import type { ApiResponse, LoadoutApi } from "@loadout/shared";
import { callChannel } from "../../src/main/dispatch.ts";
import { PREVIEW_VERSION, createAppStub } from "./app-stub.ts";
import { createFixtureFetch } from "./fetch.ts";
import { runScenario } from "./scenarios.ts";
import { seedFiles, seedLibrary } from "./seed.ts";
import { createSnapshots, createWorld, fileSecrets, removeWorld } from "./world.ts";

interface Command {
  id: number;
  kind: "invoke" | "reset" | "setup";
  channel?: string;
  args?: unknown;
  scenario?: string;
}

/** How long a reset waits for calls of the page before it, so none writes into the new seed. */
const SETTLE_MS = 5_000;

const world = createWorld(process.argv[2] ?? "preview");
const snapshots = createSnapshots(world);
let core: Core | null = null;
let api: LoadoutApi | null = null;
const running = new Set<Promise<unknown>>();

function open(): void {
  core = createCore({
    homeDir: world.home,
    configDir: world.config,
    secrets: fileSecrets(world),
    emit: (event, payload) => process.send?.({ event, payload }),
    fetchImpl: createFixtureFetch(world),
    safetyScannerPath: null,
    builtinSafety: true,
    migrateLibrary: false,
    host: { appVersion: PREVIEW_VERSION, downloadsDir: join(world.home, "Downloads") },
  });
  api = { ...core.api, app: createAppStub(world) };
}

function close(): void {
  core?.close();
  core = null;
  api = null;
}

async function seed(): Promise<void> {
  seedFiles(world);
  open();
  await seedLibrary(world, api as LoadoutApi);
  close();
  snapshots.take();
  open();
}

async function reset(): Promise<void> {
  await Promise.race([Promise.allSettled(running), delay(SETTLE_MS, null, { ref: false })]);
  close();
  await snapshots.restore();
  open();
}

let ready = seed();
// Every call answers with this error too; logged once here so the terminal says why.
ready.catch((error: unknown) => console.error("The preview session could not seed", error));

async function answer(command: Command): Promise<ApiResponse<unknown>> {
  try {
    await ready;
    if (command.kind === "reset") {
      ready = reset();
      await ready;
      return { ok: true, value: null };
    }
    if (command.kind === "setup") {
      return {
        ok: true,
        value: await runScenario(command.scenario ?? "", world, api as LoadoutApi),
      };
    }
    const call = callChannel(api as LoadoutApi, command.channel ?? "", command.args);
    running.add(call);
    try {
      return { ok: true, value: await call };
    } finally {
      running.delete(call);
    }
  } catch (error) {
    return { ok: false, error: toErrorShape(error) };
  }
}

process.on("message", (command: Command) => {
  void answer(command).then((reply) => process.send?.({ id: command.id, reply }));
});

/** The dev server went away or stopped the session: its temporary home goes with it. */
function shutDown(): void {
  close();
  removeWorld(world);
  process.exit(0);
}
process.on("disconnect", shutDown);
process.on("SIGTERM", shutDown);
