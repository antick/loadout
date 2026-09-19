/**
 * A small, dependency-free argument parser. Commands declare the flags they accept; anything else
 * is a usage error, so a typo never silently changes what a command does.
 */

export type FlagType = "boolean" | "string" | "list";

export interface FlagSpec {
  /** Long name without the dashes, e.g. `dry-run`. */
  name: string;
  /** Single-letter alias without the dash. */
  short?: string;
  type: FlagType;
  /** Placeholder shown in help for flags that take a value. */
  value?: string;
  description: string;
}

export type FlagValue = boolean | string | string[];

export interface ParsedArgs {
  positionals: string[];
  flags: Record<string, FlagValue>;
}

/** Wrong invocation rather than a failed operation. Exit code 2. */
export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

const LONG_PREFIX = "--";
const SHORT_PREFIX = "-";
const TERMINATOR = "--";

function findSpec(specs: readonly FlagSpec[], token: string): FlagSpec | undefined {
  if (token.startsWith(LONG_PREFIX)) return specs.find((s) => s.name === token.slice(2));
  return specs.find((s) => s.short !== undefined && s.short === token.slice(1));
}

const looksLikeFlag = (token: string): boolean =>
  token.startsWith(SHORT_PREFIX) && token.length > 1 && !/^-\d/.test(token);

export function parseArgs(tokens: readonly string[], specs: readonly FlagSpec[]): ParsedArgs {
  const positionals: string[] = [];
  const flags: Record<string, FlagValue> = {};
  let index = 0;
  while (index < tokens.length) {
    const token = tokens[index] as string;
    index += 1;
    if (token === TERMINATOR) {
      positionals.push(...tokens.slice(index));
      break;
    }
    if (!looksLikeFlag(token)) {
      positionals.push(token);
      continue;
    }
    const equals = token.startsWith(LONG_PREFIX) ? token.indexOf("=") : -1;
    const label = equals === -1 ? token : token.slice(0, equals);
    const spec = findSpec(specs, label);
    if (!spec) throw new UsageError(`Unknown option: ${label}`);

    if (spec.type === "boolean") {
      if (equals !== -1) throw new UsageError(`Option ${label} does not take a value.`);
      flags[spec.name] = true;
      continue;
    }
    let value: string | undefined;
    if (equals !== -1) {
      value = token.slice(equals + 1);
    } else {
      value = tokens[index];
      index += 1;
    }
    if (value === undefined || (equals === -1 && looksLikeFlag(value))) {
      throw new UsageError(`Option ${label} needs a value.`);
    }
    if (spec.type === "list") {
      const existing = flags[spec.name];
      flags[spec.name] = [...(Array.isArray(existing) ? existing : []), value];
    } else {
      if (flags[spec.name] !== undefined) throw new UsageError(`Option ${label} was given twice.`);
      flags[spec.name] = value;
    }
  }
  return { positionals, flags };
}

/** Typed readers, so commands never cast. */
export function flagBoolean(args: ParsedArgs, name: string): boolean {
  return args.flags[name] === true;
}

export function flagString(args: ParsedArgs, name: string): string | undefined {
  const value = args.flags[name];
  return typeof value === "string" ? value : undefined;
}

export function flagList(args: ParsedArgs, name: string): string[] {
  const value = args.flags[name];
  return Array.isArray(value) ? value : [];
}

export function flagInteger(args: ParsedArgs, name: string): number | undefined {
  const text = flagString(args, name);
  if (text === undefined) return undefined;
  const value = Number(text);
  if (!Number.isInteger(value) || value <= 0) {
    throw new UsageError(`Option --${name} must be a whole number above zero.`);
  }
  return value;
}

/**
 * Split off what comes before the command: global flags and up to `depth` command words.
 * Stops at the first token that is neither, leaving it for the command's own parser.
 */
export function splitCommandPath(
  tokens: readonly string[],
  globals: readonly FlagSpec[],
  depth: number,
): { path: string[]; rest: string[] } {
  const path: string[] = [];
  const rest: string[] = [];
  let index = 0;
  while (index < tokens.length && path.length < depth) {
    const token = tokens[index] as string;
    if (token === TERMINATOR) break;
    if (!looksLikeFlag(token)) {
      path.push(token);
      index += 1;
      continue;
    }
    const equals = token.startsWith(LONG_PREFIX) ? token.indexOf("=") : -1;
    const spec = findSpec(globals, equals === -1 ? token : token.slice(0, equals));
    if (!spec) break;
    rest.push(token);
    index += 1;
    if (spec.type !== "boolean" && equals === -1 && index < tokens.length) {
      rest.push(tokens[index] as string);
      index += 1;
    }
  }
  return { path, rest: [...rest, ...tokens.slice(index)] };
}
