import { ApiError, type ApiResponse, type SkillboardApi } from "@skillboard/shared";

const BRIDGE_MISSING_MESSAGE =
  "The desktop bridge is not available. Open this screen inside the Skillboard app.";

/** Sends one call over the preload bridge and unwraps the response, throwing `ApiError` on failure. */
async function invoke(channel: string, args: unknown[]): Promise<unknown> {
  const bridge = typeof window === "undefined" ? undefined : window.skillboard;
  if (!bridge) throw new ApiError({ code: "UNSUPPORTED", message: BRIDGE_MISSING_MESSAGE });

  const response = (await bridge.invoke(channel, args)) as ApiResponse<unknown>;
  if (response.ok) return response.value;
  throw new ApiError(response.error);
}

function createNamespace(namespace: string): object {
  const methods = new Map<string, (...args: unknown[]) => Promise<unknown>>();
  return new Proxy(
    {},
    {
      get(_target, method) {
        if (typeof method !== "string") return undefined;
        let fn = methods.get(method);
        if (!fn) {
          fn = (...args: unknown[]) => invoke(`${namespace}.${method}`, args);
          methods.set(method, fn);
        }
        return fn;
      },
    },
  );
}

const namespaces = new Map<string, object>();

/** Typed proxy over the single IPC channel: `api.skills.list()` calls channel `skills.list`. */
export const api = new Proxy(
  {},
  {
    get(_target, namespace) {
      if (typeof namespace !== "string") return undefined;
      let proxy = namespaces.get(namespace);
      if (!proxy) {
        proxy = createNamespace(namespace);
        namespaces.set(namespace, proxy);
      }
      return proxy;
    },
  },
) as SkillboardApi;
