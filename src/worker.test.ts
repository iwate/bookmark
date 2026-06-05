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
    sql: [] as string[],
    bind: [] as unknown[][],
    all: 0,
    run: 0,
  };
  const prepare = (sql = '') => {
    calls.prepare += 1;
    calls.sql.push(sql);
    return {
      bind: (...values: unknown[]) => {
        calls.bind.push(values);
        return {
          all: async () => {
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
          },
          run: async () => {
            calls.run += 1;
            if (sql.includes('INSERT INTO bookmarks')) {
              const [url, thumbnailUrl, comment, createdAt] = values as [string, string | null, string | null, string];
              bookmarks.unshift({
                id: bookmarks.length + 1,
                url,
                thumbnailUrl: thumbnailUrl ?? '',
                comment: comment ?? '',
                createdAt,
              });
              return { meta: { changes: 1 } };
            }

            if (sql.includes('UPDATE bookmarks')) {
              const [url, thumbnailUrl, comment, id] = values as [string, string | null, string | null, number];
              const target = bookmarks.find((bookmark) => bookmark.id === id);
              if (!target) {
                return { meta: { changes: 0 } };
              }
              target.url = url;
              target.thumbnailUrl = thumbnailUrl ?? '';
              target.comment = comment ?? '';
              return { meta: { changes: 1 } };
            }

            if (sql.includes('DELETE FROM bookmarks')) {
              const [id] = values as [number];
              const index = bookmarks.findIndex((bookmark) => bookmark.id === id);
              if (index < 0) {
                return { meta: { changes: 0 } };
              }
              bookmarks.splice(index, 1);
              return { meta: { changes: 1 } };
            }

            return { meta: { changes: 1 } };
          },
        };
      },
    };
  };

  return {
    db: { prepare },
    calls,
    bookmarks,
    all: async () => ({
      results: bookmarks.map((bookmark) => ({
        id: bookmark.id,
        url: bookmark.url,
        thumbnail_url: bookmark.thumbnailUrl || null,
        comment: bookmark.comment || null,
        created_at: bookmark.createdAt,
      })),
    }),
    run: async () => ({ meta: { changes: 1 } }),
  };
}

{
  const mock = createDbMock();
  const response = await app.fetch(new Request('https://example.com/'), { DB: mock.db } as never);

  assert.equal(response.status, 200);
  const html = await response.text();
  assert.ok(html.includes('https://example.com'));
  assert.ok(html.includes('href="/?edit=1#editor"'));
  assert.ok(!html.includes('<details>'));
}

{
  const mock = createDbMock();
  const response = await app.fetch(new Request('https://example.com/?edit=1#editor'), { DB: mock.db } as never);

  assert.equal(response.status, 200);
  const html = await response.text();
  assert.ok(html.includes('Editing #1'));
  assert.ok(html.includes('action="/bookmarks/1/update"'));
  assert.ok(html.includes('action="/bookmarks/1/delete"'));
  assert.ok(html.includes('Cancel edit'));
}

{
  const mock = createDbMock();
  const response = await app.fetch(new Request('https://example.com/rss.xml'), { DB: mock.db } as never);

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/rss+xml; charset=utf-8');
  const rss = await response.text();
  assert.ok(rss.includes('https://example.com'));
}

{
  const response = await app.fetch(new Request('https://example.com/'), { WRITE_SECRET: 'secret' } as never);

  assert.equal(response.status, 500);
  assert.equal(await response.text(), 'server misconfigured');
}

{
  const mock = createDbMock();
  const response = await app.fetch(new Request('https://example.com/'), { DB: mock.db, WRITE_SECRET: '' });

  assert.equal(response.status, 200);
  const html = await response.text();
  assert.ok(html.includes('https://example.com'));
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
    new Request('https://example.com/bookmarks/1/update', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        url: 'https://example.com/updated',
        thumbnailUrl: 'https://example.com/updated.png',
        comment: 'updated',
        secret: 'secret',
      }),
    }),
    { DB: mock.db, WRITE_SECRET: 'secret' },
  );

  assert.equal(response.status, 302);
  assert.equal(mock.bookmarks[0]?.url, 'https://example.com/updated');
}

{
  const mock = createDbMock();
  const response = await app.fetch(
    new Request('https://example.com/bookmarks/404/update', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        url: 'https://example.com/updated',
        thumbnailUrl: '',
        comment: '',
        secret: 'secret',
      }),
    }),
    { DB: mock.db, WRITE_SECRET: 'secret' },
  );

  assert.equal(response.status, 404);
  assert.equal(await response.text(), 'not found');
}

{
  const mock = createDbMock();
  const response = await app.fetch(
    new Request('https://example.com/bookmarks/1/update', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        url: 'invalid',
        thumbnailUrl: '',
        comment: '',
        secret: 'secret',
      }),
    }),
    { DB: mock.db, WRITE_SECRET: 'secret' },
  );

  assert.equal(response.status, 400);
}

{
  const mock = createDbMock();
  const response = await app.fetch(
    new Request('https://example.com/bookmarks/1/update', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        url: 'https://example.com/updated',
        thumbnailUrl: '',
        comment: '',
        secret: 'wrong-secret',
      }),
    }),
    { DB: mock.db, WRITE_SECRET: 'secret' },
  );

  assert.equal(response.status, 403);
  const html = await response.text();
  assert.ok(html.includes('is invalid'));
  assert.ok(!html.includes('wrong-secret'));
  assert.ok(html.includes('Editing #1'));
}

{
  const mock = createDbMock();
  mock.db.prepare = () => {
    throw new Error('db down');
  };

  const response = await app.fetch(
    new Request('https://example.com/bookmarks/1/update', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        url: 'https://example.com/updated',
        thumbnailUrl: '',
        comment: '',
        secret: 'secret',
      }),
    }),
    { DB: mock.db, WRITE_SECRET: 'secret' },
  );

  assert.equal(response.status, 500);
  assert.equal(await response.text(), 'internal server error');
}

{
  const mock = createDbMock();
  const response = await app.fetch(
    new Request('https://example.com/bookmarks/1/update', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'sec-fetch-site': 'cross-site',
      },
      body: new URLSearchParams({
        url: 'https://example.com/updated',
        thumbnailUrl: '',
        comment: '',
        secret: 'secret',
      }),
    }),
    { DB: mock.db, WRITE_SECRET: 'secret' },
  );

  assert.equal(response.status, 403);
  assert.equal(await response.text(), 'forbidden');
}

{
  const mock = createDbMock();
  const response = await app.fetch(
    new Request('https://example.com/bookmarks/1/delete', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret: 'secret' }),
    }),
    { DB: mock.db, WRITE_SECRET: 'secret' },
  );

  assert.equal(response.status, 302);
  assert.equal(mock.bookmarks.some((bookmark) => bookmark.id === 1), false);
}

{
  const mock = createDbMock();
  const response = await app.fetch(
    new Request('https://example.com/bookmarks/404/delete', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret: 'secret' }),
    }),
    { DB: mock.db, WRITE_SECRET: 'secret' },
  );

  assert.equal(response.status, 404);
  assert.equal(await response.text(), 'not found');
}

{
  const mock = createDbMock();
  const response = await app.fetch(
    new Request('https://example.com/bookmarks/1/delete', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret: 'wrong-secret' }),
    }),
    { DB: mock.db, WRITE_SECRET: 'secret' },
  );

  assert.equal(response.status, 403);
  const html = await response.text();
  assert.ok(html.includes('is invalid'));
  assert.ok(!html.includes('wrong-secret'));
  assert.ok(html.includes('Editing #1'));
}

{
  const mock = createDbMock();
  mock.db.prepare = () => {
    throw new Error('db down');
  };

  const response = await app.fetch(
    new Request('https://example.com/bookmarks/1/delete', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret: 'secret' }),
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
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ url: 'https://example.com' }),
    }),
    { DB: mock.db } as never,
  );

  assert.equal(response.status, 500);
  assert.equal(await response.text(), 'server misconfigured');
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
