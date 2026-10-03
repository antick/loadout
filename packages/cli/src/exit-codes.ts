export const EXIT_OK = 0;
export const EXIT_FAILED = 1;
export const EXIT_USAGE = 2;

/** The exit code of a command that finished, with some part of it failing or not. */
export function exitCodeFor(failed: boolean): number {
  return failed ? EXIT_FAILED : EXIT_OK;
}
