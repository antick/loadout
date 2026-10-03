/** DEV ONLY. The browser preview's fake API, typed by the real one so the two cannot drift. */
import type { LoadoutApi } from "@loadout/shared";

type Namespace = keyof LoadoutApi & string;

/** Every channel the renderer can call: `<namespace>.<method>`. */
export type MockChannel = {
  [N in Namespace]: `${N}.${keyof LoadoutApi[N] & string}`;
}[Namespace];

type MethodOf<C extends MockChannel> = C extends `${infer N extends Namespace}.${infer M}`
  ? M extends keyof LoadoutApi[N]
    ? LoadoutApi[N][M]
    : never
  : never;

/** A fake of one method: its parameters (or fewer), and its value or a promise of it. */
export type MockHandler<C extends MockChannel> =
  MethodOf<C> extends (...args: infer A) => infer R
    ? (...args: A) => Awaited<R> | Promise<Awaited<R>>
    : never;

/** Fakes by channel. A channel left out answers UNSUPPORTED in the preview. */
export type MockHandlers = { [C in MockChannel]?: MockHandler<C> };

type AnyHandler = (...args: never[]) => unknown;

/** The untyped view, for the bridge that receives channel names as text. */
export function handlerFor(handlers: MockHandlers, channel: string): AnyHandler | undefined {
  return (handlers as Record<string, AnyHandler | undefined>)[channel];
}

/** Call another fake, as the real services call each other. */
export function callMock<C extends MockChannel>(
  handlers: MockHandlers,
  channel: C,
  ...args: Parameters<MockHandler<C>>
): Promise<Awaited<ReturnType<MockHandler<C>>>> {
  const handler = handlerFor(handlers, channel);
  if (!handler) throw new Error(`No mock for ${channel}`);
  return Promise.resolve(handler(...(args as unknown as never[]))) as Promise<
    Awaited<ReturnType<MockHandler<C>>>
  >;
}
