/**
 * Environment helpers for tests that run git, shared by core and cli tests. Isolation from the
 * developer's own git config is not here: `git-setup.ts` does it for every test.
 */

const GITHUB_PREFIX = "https://github.com/";

/** Set environment variables for this process; returns the undo function. */
export function setEnv(values: Record<string, string>): () => void {
  const before = Object.keys(values).map((key) => [key, process.env[key]] as const);
  Object.assign(process.env, values);
  return () => {
    for (const [key, value] of before) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
}

/**
 * Point `https://github.com/` at a local folder for every git process started from here, so
 * GitHub URLs (tree links, marketplace installs) clone a fixture instead of the network.
 */
export function redirectGithubTo(remotesDir: string): () => void {
  return setEnv({
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: `url.${remotesDir}/.insteadOf`,
    GIT_CONFIG_VALUE_0: GITHUB_PREFIX,
  });
}
