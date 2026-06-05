import assert from 'node:assert/strict';
import app from './worker.ts';

function createDbMock() {
  const bookmarks = [
    {
      id: 1,
      title: 'hello title',
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
                title: bookmark.title || null,
                thumbnail_url: bookmark.thumbnailUrl || null,
                comment: bookmark.comment || null,
                created_at: bookmark.createdAt,
              })),
            };
          },
          run: async () => {
            calls.run += 1;
            if (sql.includes('INSERT INTO bookmarks')) {
              const [url, thumbnailUrl, comment, title, createdAt] = values as [string, string | null, string | null, string | null, string];
              bookmarks.unshift({
                id: bookmarks.length + 1,
                url,
                thumbnailUrl: thumbnailUrl ?? '',
                comment: comment ?? '',
                title: title ?? '',
                createdAt,
              });
              return { meta: { changes: 1 } };
            }

            if (sql.includes('UPDATE bookmarks')) {
              const [url, thumbnailUrl, comment, title, id] = values as [string, string | null, string | null, string | null, number];
              const target = bookmarks.find((bookmark) => bookmark.id === id);
              if (!target) {
                return { meta: { changes: 0 } };
              }
              target.url = url;
              target.thumbnailUrl = thumbnailUrl ?? '';
              target.comment = comment ?? '';
              target.title = title ?? '';
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
        title: bookmark.title || null,
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
  assert.ok(html.includes('hello title'));
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
  assert.ok(html.includes('formaction="/bookmarks/1/delete"'));
  assert.ok(html.includes('formmethod="post"'));
  assert.ok(html.includes('formnovalidate'));
  assert.equal((html.match(/<form\b/g) ?? []).length, 1);
  assert.equal((html.match(/name="secret"/g) ?? []).length, 1);
  assert.ok(html.includes('Cancel edit'));
}

{
  const mock = createDbMock();
  const response = await app.fetch(new Request('https://example.com/rss.xml'), { DB: mock.db } as never);

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/rss+xml; charset=utf-8');
  const rss = await response.text();
  assert.ok(rss.includes('<title>hello title</title>'));
  assert.ok(rss.includes('https://example.com'));
}

{
  const mock = createDbMock();
  mock.bookmarks[0].title = '';
  const response = await app.fetch(new Request('https://example.com/rss.xml'), { DB: mock.db } as never);

  assert.equal(response.status, 200);
  const rss = await response.text();
  assert.ok(rss.includes('<title>https://example.com</title>'));
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
        title: 'updated title',
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
  assert.equal(mock.bookmarks[0]?.title, 'updated title');
}

{
  const mock = createDbMock();
  const response = await app.fetch(
    new Request('https://example.com/bookmarks/404/update', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        title: '',
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
        title: '',
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
        title: '',
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
        title: '',
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
  const originalFetch = globalThis.fetch;
  let upstreamFetchCalls = 0;

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith('https://cloudflare-dns.com/dns-query?')) {
      const dnsUrl = new URL(url);
      if (dnsUrl.searchParams.get('type') === 'A') {
        return new Response(JSON.stringify({ Status: 0, Answer: [{ type: 1, data: '93.184.216.34' }] }), {
          status: 200,
          headers: { 'content-type': 'application/dns-json' },
        });
      }

      return new Response(JSON.stringify({ Status: 0, Answer: [] }), {
        status: 200,
        headers: { 'content-type': 'application/dns-json' },
      });
    }

    upstreamFetchCalls += 1;
    assert.equal(url, 'https://example.com/page');
    return new Response(
      '<html><head><meta property="og:title" content="Fetched title"><meta property="og:image" content="/thumb.png"></head></html>',
      {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      },
    );
  }) as typeof fetch;

  try {
    const response = await app.fetch(
      new Request('https://example.com/bookmarks/metadata', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: 'https://example.com/page' }),
      }),
      { DB: mock.db } as never,
    );

    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /application\/json/i);
    assert.deepEqual(await response.json(), {
      title: 'Fetched title',
      thumbnailUrl: 'https://example.com/thumb.png',
    });
    assert.equal(upstreamFetchCalls, 1);
    assert.equal(mock.calls.prepare, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

{
  const mock = createDbMock();
  const response = await app.fetch(
    new Request('https://example.com/bookmarks/metadata', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'ftp://example.com/page' }),
    }),
    { DB: mock.db } as never,
  );

  assert.equal(response.status, 400);
  assert.equal(await response.text(), 'url must use http or https');
}

{
  const mock = createDbMock();
  const response = await app.fetch(
    new Request('https://example.com/bookmarks/metadata', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'http://127.0.0.1/internal' }),
    }),
    { DB: mock.db } as never,
  );

  assert.equal(response.status, 400);
  assert.equal(await response.text(), 'url host is not allowed');
}

{
  const mock = createDbMock();
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith('https://cloudflare-dns.com/dns-query?')) {
      const dnsUrl = new URL(url);
      if (dnsUrl.searchParams.get('type') === 'A') {
        return new Response(JSON.stringify({ Status: 0, Answer: [{ type: 1, data: '93.184.216.34' }] }), {
          status: 200,
          headers: { 'content-type': 'application/dns-json' },
        });
      }

      return new Response(JSON.stringify({ Status: 0, Answer: [] }), {
        status: 200,
        headers: { 'content-type': 'application/dns-json' },
      });
    }

    return new Response('plain text', {
      status: 200,
      headers: { 'content-type': 'text/plain' },
    });
  }) as typeof fetch;

  try {
    const response = await app.fetch(
      new Request('https://example.com/bookmarks/metadata', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: 'https://example.com/plain' }),
      }),
      { DB: mock.db } as never,
    );

    assert.equal(response.status, 422);
    assert.equal(await response.text(), 'content-type must be text/html');
  } finally {
    globalThis.fetch = originalFetch;
  }
}

{
  const mock = createDbMock();
  const originalFetch = globalThis.fetch;
  let upstreamFetchCalls = 0;

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith('https://cloudflare-dns.com/dns-query?')) {
      const dnsUrl = new URL(url);
      if (dnsUrl.searchParams.get('type') === 'A') {
        return new Response(JSON.stringify({ Status: 0, Answer: [{ type: 1, data: '93.184.216.34' }] }), {
          status: 200,
          headers: { 'content-type': 'application/dns-json' },
        });
      }

      return new Response(JSON.stringify({ Status: 0, Answer: [] }), {
        status: 200,
        headers: { 'content-type': 'application/dns-json' },
      });
    }

    upstreamFetchCalls += 1;
    return new Response('', {
      status: 302,
      headers: { location: 'http://127.0.0.1/private' },
    });
  }) as typeof fetch;

  try {
    const response = await app.fetch(
      new Request('https://example.com/bookmarks/metadata', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: 'https://example.com/start' }),
      }),
      { DB: mock.db } as never,
    );

    assert.equal(response.status, 400);
    assert.equal(await response.text(), 'url host is not allowed');
    assert.equal(upstreamFetchCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

{
  const mock = createDbMock();
  const response = await app.fetch(
    new Request('https://example.com/bookmarks/metadata', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'http://[::]/internal' }),
    }),
    { DB: mock.db } as never,
  );

  assert.equal(response.status, 400);
  assert.equal(await response.text(), 'url host is not allowed');
}

{
  const mock = createDbMock();
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith('https://cloudflare-dns.com/dns-query?')) {
      const dnsUrl = new URL(url);
      if (dnsUrl.searchParams.get('type') === 'A') {
        return new Response(JSON.stringify({ Status: 0, Answer: [{ type: 1, data: '93.184.216.34' }] }), {
          status: 200,
          headers: { 'content-type': 'application/dns-json' },
        });
      }

      return new Response(JSON.stringify({ Status: 0, Answer: [] }), {
        status: 200,
        headers: { 'content-type': 'application/dns-json' },
      });
    }

    const timeoutError = new Error('timed out');
    timeoutError.name = 'TimeoutError';
    throw timeoutError;
  }) as typeof fetch;

  try {
    const response = await app.fetch(
      new Request('https://example.com/bookmarks/metadata', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: 'https://example.com/slow' }),
      }),
      { DB: mock.db } as never,
    );

    assert.equal(response.status, 504);
    assert.equal(await response.text(), 'upstream timeout');
  } finally {
    globalThis.fetch = originalFetch;
  }
}

{
  const mock = createDbMock();
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith('https://cloudflare-dns.com/dns-query?')) {
      const dnsUrl = new URL(url);
      if (dnsUrl.searchParams.get('type') === 'A') {
        return new Response(JSON.stringify({ Status: 0, Answer: [{ type: 1, data: '93.184.216.34' }] }), {
          status: 200,
          headers: { 'content-type': 'application/dns-json' },
        });
      }

      return new Response(JSON.stringify({ Status: 0, Answer: [] }), {
        status: 200,
        headers: { 'content-type': 'application/dns-json' },
      });
    }

    return new Response('<html><head><title>too large</title></head></html>', {
      status: 200,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'content-length': String(256 * 1024 + 1),
      },
    });
  }) as typeof fetch;

  try {
    const response = await app.fetch(
      new Request('https://example.com/bookmarks/metadata', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: 'https://example.com/too-large' }),
      }),
      { DB: mock.db } as never,
    );

    assert.equal(response.status, 422);
    assert.equal(await response.text(), 'response too large');
  } finally {
    globalThis.fetch = originalFetch;
  }
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
        title: '',
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
        title: 'created title',
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
  assert.equal(mock.bookmarks[0]?.title, 'created title');
}

{
  const mock = createDbMock();
  const response = await app.fetch(
    new Request('https://example.com/bookmarks', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        title: '',
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
        title: '',
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
