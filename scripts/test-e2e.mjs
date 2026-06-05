import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const WRANGLER_PATH = './node_modules/.bin/wrangler';
const HOST = '127.0.0.1';
const PORT = 8788;
const BASE_URL = `http://${HOST}:${PORT}`;
const WRITE_SECRET = 'test-e2e-secret';
const STARTUP_TIMEOUT_MS = 30_000;

function runCommand(command, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env,
      stdio: 'inherit',
      shell: false,
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(' ')} failed with exit code ${code}`));
    });
  });
}

async function waitForServerReady() {
  const start = Date.now();

  while (Date.now() - start < STARTUP_TIMEOUT_MS) {
    try {
      const response = await fetch(`${BASE_URL}/`);
      if (response.status === 200) {
        return;
      }
    } catch {
      // Keep polling until Wrangler starts serving requests.
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Timed out waiting for ${BASE_URL} to become ready`);
}

async function runE2eChecks() {
  const unique = Date.now().toString(36);
  const bookmarkUrl = `https://example.com/e2e-${unique}`;

  const indexResponse = await fetch(`${BASE_URL}/`);
  assert.equal(indexResponse.status, 200, 'GET / should return 200');

  const postResponse = await fetch(`${BASE_URL}/bookmarks`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      url: bookmarkUrl,
      thumbnailUrl: `https://example.com/thumb-${unique}.png`,
      comment: `e2e-${unique}`,
      secret: WRITE_SECRET,
    }),
    redirect: 'manual',
  });
  assert.equal(postResponse.status, 302, 'POST /bookmarks with valid WRITE_SECRET should redirect');

  const rssResponse = await fetch(`${BASE_URL}/rss.xml`);
  assert.equal(rssResponse.status, 200, 'GET /rss.xml should return 200');
  assert.match(
    rssResponse.headers.get('content-type') ?? '',
    /application\/rss\+xml/i,
    'GET /rss.xml should return RSS content type',
  );

  const rssBody = await rssResponse.text();
  assert.ok(rssBody.includes(bookmarkUrl), 'RSS feed should include the posted bookmark URL');
}

async function terminateProcess(child) {
  if (child.exitCode !== null) {
    return;
  }

  await new Promise((resolve) => {
    child.once('exit', () => resolve());
    child.kill('SIGTERM');

    setTimeout(() => {
      if (child.exitCode === null) {
        child.kill('SIGKILL');
      }
    }, 2_000);
  });
}

async function main() {
  await runCommand(WRANGLER_PATH, ['d1', 'migrations', 'apply', 'bookmark', '--local']);

  const devServer = spawn(WRANGLER_PATH, ['dev', 'src/worker.ts', '--ip', HOST, '--port', String(PORT)], {
    env: { ...process.env, WRITE_SECRET },
    stdio: 'inherit',
    shell: false,
  });

  try {
    await waitForServerReady();
    await runE2eChecks();
    console.log('e2e checks passed');
  } finally {
    await terminateProcess(devServer);
  }
}

await main();