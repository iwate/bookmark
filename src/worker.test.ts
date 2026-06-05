import assert from 'node:assert/strict';
import app from './worker.ts';

function createDbMock() {
  const bookmarks = [
    {
      id: 1,
      url: 'https://example.com',
      thumbnailUrl: '',
      comment: 'hello',
      createdAt: '2026-06-05T00:00:00.000Z',
    },
  ];

  const calls = {
    prepare: 0,
    bind: [] as unknown[][],
    all: 0,
    run: 0,
  };
  const all = async () => {
    calls.all += 1;
    return {
      results: bookmarks.map((bookmark) => ({
        id: bookmark.id,
        url: bookmark.url,
        thumbnail_url: bookmark.thumbnailUrl || null,
        comment: bookmark.comment || null,
        created_at: bookmark.createdAt,
      })),
    };
  };
  const run = async () => {
    calls.run += 1;
    return undefined;
  };
  const bind = (...values: unknown[]) => {
    calls.bind.push(values);
    return { all, run };
  };
  const prepare = () => {
    calls.prepare += 1;
    return { bind };
  };

  return { db: { prepare }, calls, all, run, bind };
}

{
  const mock = createDbMock();
  const response = await app.fetch(new Request('https://example.com/'), { DB: mock.db, WRITE_SECRET: 'secret' });

  assert.equal(response.status, 200);
  const html = await response.text();
  assert.ok(html.includes('https://example.com'));
}

{
  const response = await app.fetch(new Request('https://example.com/'), { WRITE_SECRET: 'secret' } as never);

  assert.equal(response.status, 500);
  assert.equal(await response.text(), 'server misconfigured');
}

{
  const mock = createDbMock();
  const response = await app.fetch(new Request('https://example.com/'), { DB: mock.db, WRITE_SECRET: '' });

  assert.equal(response.status, 500);
  assert.equal(await response.text(), 'server misconfigured');
}

{
  const mock = createDbMock();
  mock.db.prepare = () => {
    throw new Error('db down');
  };

  const response = await app.fetch(new Request('https://example.com/'), { DB: mock.db, WRITE_SECRET: 'secret' });

  assert.equal(response.status, 500);
  assert.equal(await response.text(), 'internal server error');
}

{
  const mock = createDbMock();
  const response = await app.fetch(
    new Request('https://example.com/bookmarks', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ url: 'https://example.com', secret: 'wrong' }),
    }),
    { DB: mock.db, WRITE_SECRET: 'secret' },
  );

  assert.equal(response.status, 403);
  assert.equal(mock.calls.prepare, 1);
}

{
  const mock = createDbMock();
  const response = await app.fetch(
    new Request('https://example.com/bookmarks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{ bad json',
    }),
    { DB: mock.db, WRITE_SECRET: 'secret' },
  );

  assert.equal(response.status, 400);
  assert.equal(await response.text(), 'invalid request body');
}

{
  const mock = createDbMock();
  const response = await app.fetch(
    new Request('https://example.com/bookmarks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'null',
    }),
    { DB: mock.db, WRITE_SECRET: 'secret' },
  );

  assert.equal(response.status, 400);
  assert.equal(await response.text(), 'invalid request body');
}

{
  const mock = createDbMock();
  const response = await app.fetch(
    new Request('https://example.com/bookmarks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '["https://example.com"]',
    }),
    { DB: mock.db, WRITE_SECRET: 'secret' },
  );

  assert.equal(response.status, 400);
  assert.equal(await response.text(), 'invalid request body');
}

{
  const mock = createDbMock();
  const response = await app.fetch(
    new Request('https://example.com/bookmarks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '"hello"',
    }),
    { DB: mock.db, WRITE_SECRET: 'secret' },
  );

  assert.equal(response.status, 400);
  assert.equal(await response.text(), 'invalid request body');
}

{
  const mock = createDbMock();
  const response = await app.fetch(
    new Request('https://example.com/bookmarks', {
      method: 'POST',
      headers: { 'content-type': 'multipart/form-data' },
      body: 'bad form body',
    }),
    { DB: mock.db, WRITE_SECRET: 'secret' },
  );

  assert.equal(response.status, 400);
  assert.equal(await response.text(), 'invalid request body');
}

{
  const mock = createDbMock();
  const response = await app.fetch(
    new Request('https://example.com/bookmarks', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'hello',
    }),
    { DB: mock.db, WRITE_SECRET: 'secret' },
  );

  assert.equal(response.status, 400);
  assert.equal(await response.text(), 'unsupported content type');
}

{
  const mock = createDbMock();
  const response = await app.fetch(
    new Request('https://example.com/bookmarks', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ url: 'https://example.com', secret: 'shared-secret-value' }),
    }),
    { DB: mock.db, WRITE_SECRET: 'secret' },
  );

  assert.equal(response.status, 403);
  const html = await response.text();
  assert.ok(!html.includes('shared-secret-value'));
}

{
  const mock = createDbMock();
  mock.db.prepare = () => {
    throw new Error('db down');
  };

  const response = await app.fetch(
    new Request('https://example.com/bookmarks', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ url: 'https://example.com', secret: 'wrong' }),
    }),
    { DB: mock.db, WRITE_SECRET: 'secret' },
  );

  assert.equal(response.status, 500);
  assert.equal(await response.text(), 'internal server error');
}

{
  const mock = createDbMock();
  const response = await app.fetch(
    new Request('https://example.com/bookmarks', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        url: 'https://example.com',
        thumbnailUrl: 'https://example.com/thumb.png',
        comment: 'nice',
        secret: 'secret',
      }),
    }),
    { DB: mock.db, WRITE_SECRET: 'secret' },
  );

  assert.equal(response.status, 302);
  assert.equal(mock.calls.run, 1);
}

{
  const mock = createDbMock();
  const response = await app.fetch(
    new Request('https://example.com/bookmarks', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        url: 'https://example.com',
        thumbnailUrl: 'https://example.com/thumb.png',
        comment: 'nice',
        secret: 'secret',
      }),
    }),
    { DB: mock.db, WRITE_SECRET: '' },
  );

  assert.equal(response.status, 500);
  assert.equal(await response.text(), 'server misconfigured');
}

{
  const mock = createDbMock();
  const originalPrepare = mock.db.prepare;
  mock.db.prepare = () => ({
    bind: (...values: unknown[]) => {
      if (values.length > 0) {
        return {
          all: mock.all,
          run: async () => {
            throw new Error('insert failed');
          },
        };
      }
      return originalPrepare().bind(...values);
    },
  });

  const response = await app.fetch(
    new Request('https://example.com/bookmarks', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        url: 'https://example.com',
        thumbnailUrl: 'https://example.com/thumb.png',
        comment: 'nice',
        secret: 'secret',
      }),
    }),
    { DB: mock.db, WRITE_SECRET: 'secret' },
  );

  assert.equal(response.status, 500);
  assert.equal(await response.text(), 'internal server error');
}
