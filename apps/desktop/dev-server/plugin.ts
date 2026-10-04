import { type ChildProcess, fork } from "node:child_process";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { type Plugin, normalizePath } from "vite";
import {
  DEV_API_PREFIX,
  DEV_DEFAULT_SESSION,
  DEV_ROUTES,
  DEV_SESSION_COOKIE,
  fromWire,
  toWire,
} from "./wire";

/**
 * The renderer in a plain browser, on the real core. Each session (a cookie; the preview has
 * none) is its own Node process running `createCore` on a seeded temporary home, so git settings
 * and folders never mix. Routes under `/__loadout`: `invoke` answers like the IPC bridge, `events`
 * streams core's app events, `reset` puts the session back to its seed, `setup` runs a scenario.
 */
const SESSION_ENTRY = join(__dirname, "session", "main.ts");
const SESSION_LOADER = pathToFileURL(join(__dirname, "session", "register.ts")).href;
/** Vite serves files outside the page's folder under `/@fs/`, with forward slashes. */
const BRIDGE_URL = `/@fs/${normalizePath(join(__dirname, "browser", "bridge.ts")).replace(/^\//, "")}`;
const SESSION_ID = /^[\w-]{1,64}$/;
const STREAM_HEADERS = {
  "content-type": "text/event-stream",
  "cache-control": "no-cache",
  connection: "keep-alive",
};
/** Node flags for the session process: TypeScript as is, quietly. */
const NODE_FLAGS = [
  "--experimental-strip-types",
  "--disable-warning=ExperimentalWarning",
  "--import",
  SESSION_LOADER,
];
const COMMANDS: Record<string, string> = {
  [DEV_ROUTES.invoke]: "invoke",
  [DEV_ROUTES.reset]: "reset",
  [DEV_ROUTES.setup]: "setup",
};

interface Session {
  child: ChildProcess;
  pending: Map<number, (reply: unknown) => void>;
  streams: Set<ServerResponse>;
}

/** What a session process sends back: a reply to a command, or one of core's events. */
type SessionMessage = { id: number; reply: unknown } | { event: string; payload: unknown };

export function loadoutDevServer(): Plugin {
  const sessions = new Map<string, Session>();
  let nextId = 0;

  const start = (name: string): Session => {
    const child = fork(SESSION_ENTRY, [name], { execArgv: NODE_FLAGS, serialization: "advanced" });
    const session: Session = { child, pending: new Map(), streams: new Set() };
    child.on("message", (message: SessionMessage) => {
      if ("id" in message) {
        session.pending.get(message.id)?.(message.reply);
        session.pending.delete(message.id);
        return;
      }
      const data = `data: ${toWire(message)}\n\n`;
      for (const stream of session.streams) stream.write(data);
    });
    child.on("exit", (code) => {
      sessions.delete(name);
      const reply = { ok: false, error: { code: "INTERNAL", message: `Session exited (${code})` } };
      for (const answer of session.pending.values()) answer(reply);
      for (const stream of session.streams) stream.end();
    });
    sessions.set(name, session);
    return session;
  };

  const command = (session: Session, body: Record<string, unknown>): Promise<unknown> =>
    new Promise((resolve) => {
      nextId += 1;
      session.pending.set(nextId, resolve);
      session.child.send({ ...body, id: nextId });
    });

  const handle = async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    const route = (req.url ?? "").split("?")[0] ?? "";
    const name = sessionName(req);
    const session = sessions.get(name) ?? start(name);
    if (route === DEV_ROUTES.events) {
      res.writeHead(200, STREAM_HEADERS);
      res.write(": listening\n\n");
      session.streams.add(res);
      req.on("close", () => session.streams.delete(res));
      return true;
    }
    const kind = COMMANDS[route];
    if (req.method !== "POST" || !kind) return false;
    const body = (fromWire(await readBody(req)) ?? {}) as Record<string, unknown>;
    const reply = await command(session, { ...body, kind });
    res.setHeader("content-type", "application/json");
    res.end(toWire(reply));
    return true;
  };

  return {
    name: "loadout-dev-server",
    apply: "serve",
    transformIndexHtml: () => [
      { tag: "script", attrs: { type: "module", src: BRIDGE_URL }, injectTo: "head" },
    ],
    configureServer(server) {
      server.middlewares.use(DEV_API_PREFIX, (req, res, next) => {
        handle(req, res).then(
          (handled) => handled || next(),
          (error: unknown) => next(error),
        );
      });
      server.httpServer?.once("close", () => {
        for (const session of sessions.values()) session.child.kill();
      });
    },
  };
}

function sessionName(req: IncomingMessage): string {
  const cookie = (req.headers.cookie ?? "")
    .split(";")
    .map((part) => part.trim().split("="))
    .find(([key]) => key === DEV_SESSION_COOKIE)?.[1];
  return cookie && SESSION_ID.test(cookie) ? cookie : DEV_DEFAULT_SESSION;
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8") || "null";
}
