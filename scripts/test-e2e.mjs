import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const WRANGLER_PATH = './node_modules/.bin/wrangler';
const HOST = '127.0.0.1';
const PORT = 8788;
const BASE_URL = `http://${HOST}:${PORT}`;
const WRITE_SECRET = 'test-e2e-secret';
const STARTUP_TIMEOUT_MS = 30_000;
const READY_CHECK_TIMEOUT_MS = 2_000;
const SHUTDOWN_TIMEOUT_MS = 8_000;

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
      const response = await fetch(`${BASE_URL}/`, {
        signal: AbortSignal.timeout(READY_CHECK_TIMEOUT_MS),
      });
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
  const updatedBookmarkUrl = `https://example.com/e2e-updated-${unique}`;

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

  const indexAfterCreate = await fetch(`${BASE_URL}/`);
  assert.equal(indexAfterCreate.status, 200, 'GET / after create should return 200');
  const indexAfterCreateBody = await indexAfterCreate.text();
  const idMatch = indexAfterCreateBody.match(/href="\/\?edit=(\d+)#editor"[^>]*>Edit\/Delete<\/a>/);
  assert.ok(idMatch, 'Created bookmark should have an Edit/Delete link with id');
  const bookmarkId = idMatch[1];

  const editPageResponse = await fetch(`${BASE_URL}/?edit=${bookmarkId}#editor`);
  assert.equal(editPageResponse.status, 200, 'GET /?edit=id#editor should return 200');
  const editPageBody = await editPageResponse.text();
  assert.ok(editPageBody.includes(`action="/bookmarks/${bookmarkId}/update"`), 'Edit page should set update action on top form');
  assert.ok(editPageBody.includes(`formaction="/bookmarks/${bookmarkId}/delete"`), 'Edit page should expose delete button action in the top form');
  assert.ok(editPageBody.includes('formmethod="post"'), 'Delete button should submit via POST method');
  assert.ok(editPageBody.includes('formnovalidate'), 'Delete button should bypass url field validation');
  assert.equal((editPageBody.match(/<form\b/g) ?? []).length, 1, 'Edit page should have a single editor form');
  assert.equal((editPageBody.match(/name="secret"/g) ?? []).length, 1, 'Edit page should have one secret input');
  assert.ok(editPageBody.includes('Cancel edit'), 'Edit page should include cancel control');

  const updateResponse = await fetch(`${BASE_URL}/bookmarks/${bookmarkId}/update`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      url: updatedBookmarkUrl,
      thumbnailUrl: `https://example.com/thumb-updated-${unique}.png`,
      comment: `e2e-updated-${unique}`,
      secret: WRITE_SECRET,
    }),
    redirect: 'manual',
  });
  assert.equal(updateResponse.status, 302, 'POST /bookmarks/:id/update with valid WRITE_SECRET should redirect');

  const rssAfterUpdate = await fetch(`${BASE_URL}/rss.xml`);
  assert.equal(rssAfterUpdate.status, 200, 'GET /rss.xml after update should return 200');
  const rssAfterUpdateBody = await rssAfterUpdate.text();
  assert.ok(rssAfterUpdateBody.includes(updatedBookmarkUrl), 'RSS feed should include the updated bookmark URL');
  assert.ok(!rssAfterUpdateBody.includes(bookmarkUrl), 'RSS feed should not include the old bookmark URL after update');

  const deleteResponse = await fetch(`${BASE_URL}/bookmarks/${bookmarkId}/delete`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ secret: WRITE_SECRET }),
    redirect: 'manual',
  });
  assert.equal(deleteResponse.status, 302, 'POST /bookmarks/:id/delete with valid WRITE_SECRET should redirect');

  const rssAfterDelete = await fetch(`${BASE_URL}/rss.xml`);
  assert.equal(rssAfterDelete.status, 200, 'GET /rss.xml after delete should return 200');
  const rssAfterDeleteBody = await rssAfterDelete.text();
  assert.ok(!rssAfterDeleteBody.includes(updatedBookmarkUrl), 'RSS feed should not include the deleted bookmark URL');
}

async function terminateProcess(child) {
  if (child.exitCode !== null) {
    return;
  }

  await new Promise((resolve, reject) => {
    let done = false;
    const finish = (error) => {
      if (done) {
        return;
      }
      done = true;
      clearTimeout(forceKillTimer);
      clearTimeout(failTimer);
      child.removeListener('exit', onExit);
      child.removeListener('error', onError);
      if (error) {
        reject(error);
        return;
      }
      resolve();
    };

    const onExit = () => finish();
    const onError = (error) => finish(error);
    child.once('exit', onExit);
    child.once('error', onError);

    const forceKillTimer = setTimeout(() => {
      if (child.exitCode === null) {
        child.kill('SIGKILL');
      }
    }, SHUTDOWN_TIMEOUT_MS / 2);

    const failTimer = setTimeout(() => {
      finish(new Error(`Timed out stopping Wrangler dev server after ${SHUTDOWN_TIMEOUT_MS}ms`));
    }, SHUTDOWN_TIMEOUT_MS);

    if (child.exitCode !== null) {
      finish();
      return;
    }

    child.kill('SIGTERM');
  });
}

async function main() {
  await runCommand(WRANGLER_PATH, ['d1', 'migrations', 'apply', 'bookmark', '--local']);

  const devServer = spawn(WRANGLER_PATH, ['dev', 'src/worker.ts', '--ip', HOST, '--port', String(PORT)], {
    env: { ...process.env, WRITE_SECRET, CI: '1' },
    stdio: ['ignore', 'inherit', 'inherit'],
    shell: false,
  });

  let e2eError = null;

  try {
    await waitForServerReady();
    await runE2eChecks();
    console.log('e2e checks passed');
  } catch (error) {
    e2eError = error;
    throw error;
  } finally {
    try {
      await terminateProcess(devServer);
    } catch (shutdownError) {
      if (e2eError) {
        // Preserve the original e2e failure and log cleanup trouble as secondary context.
        console.error('Additional cleanup error while stopping Wrangler dev server:', shutdownError);
      } else {
        throw shutdownError;
      }
    }
  }
}

await main();