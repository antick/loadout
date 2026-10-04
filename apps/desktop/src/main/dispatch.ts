import { API_NAMESPACES, type LoadoutApi } from "@loadout/shared";

type Handler = (...args: unknown[]) => Promise<unknown>;

const NAMESPACES = new Set<string>(API_NAMESPACES);

/**
 * Call `namespace.method` on the API object. Throws for a channel the API does not have, or the
 * error `refuse` returns for its namespace. Shared by the IPC bridge and the browser preview.
 */
export async function callChannel(
  api: LoadoutApi,
  channel: string,
  args: unknown,
  refuse: (namespace: string) => Error | null = () => null,
): Promise<unknown> {
  const [namespace, method] = channel.split(".");
  if (!namespace || !method || !NAMESPACES.has(namespace)) {
    throw new Error(`Unknown API channel: ${channel}`);
  }
  const refusal = refuse(namespace);
  if (refusal) throw refusal;
  const group = api[namespace as keyof LoadoutApi] as unknown as Record<string, Handler>;
  const handler = Object.hasOwn(group, method) ? group[method] : undefined;
  if (typeof handler !== "function") throw new Error(`Unknown API channel: ${channel}`);
  return handler.apply(group, Array.isArray(args) ? args : []);
}
