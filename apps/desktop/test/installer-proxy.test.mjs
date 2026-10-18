import { execFileSync } from "node:child_process";
import { expect, test } from "vitest";

const PROXY_TEST_TIMEOUT_MS = 10_000;

// The downloader patches process-wide HTTP hooks, so exercise it in a separate process.
test("Electron builder's downloader still routes downloads through an HTTP proxy", () => {
  const output = execFileSync(
    process.execPath,
    [
      "-e",
      `
      const assert = require('node:assert/strict');
      const http = require('node:http');
      const { createRequire } = require('node:module');
      const builderRequire = createRequire(require.resolve('electron-builder'));
      const appBuilderRequire = createRequire(builderRequire.resolve('app-builder-lib'));
      const downloader = appBuilderRequire('@electron/get');
      const target = 'http://loadout-installer.invalid/artifact.zip';
      const proxy = http.createServer((request, response) => {
        assert.equal(request.url, target);
        response.end('proxied artifact');
      });
      proxy.listen(0, '127.0.0.1', () => {
        process.env.GLOBAL_AGENT_HTTP_PROXY = 'http://127.0.0.1:' + proxy.address().port;
        process.env.GLOBAL_AGENT_NO_PROXY = '';
        downloader.initializeProxy();
        http.get(target, response => {
          let body = '';
          response.on('data', chunk => { body += chunk; });
          response.on('end', () => {
            assert.equal(body, 'proxied artifact');
            proxy.close(() => { console.log('proxy verified'); });
          });
        }).on('error', error => {
          console.error(error.message);
          proxy.close(() => { process.exitCode = 1; });
        });
      });
      `,
    ],
    { cwd: new URL("..", import.meta.url), encoding: "utf8", timeout: PROXY_TEST_TIMEOUT_MS },
  );
  expect(output).toContain("proxy verified");
});
