import assert from 'node:assert/strict';
import { assertSafeFetchTarget, extractMetadataFromHtml, fetchPageMetadata } from './metadata.ts';

{
  const html = `
    <html>
      <head>
        <meta property="og:title" content="OG title">
        <meta property="og:image" content="/og.png">
        <title>Fallback title</title>
      </head>
    </html>
  `;
  const metadata = extractMetadataFromHtml(html, 'https://example.com/path');
  assert.equal(metadata.title, 'OG title');
  assert.equal(metadata.thumbnailUrl, 'https://example.com/og.png');
}

{
  const html = `
    <html>
      <head>
        <title>Fallback title</title>
        <meta property="og:image:url" content="https://cdn.example.com/og.png">
      </head>
    </html>
  `;
  const metadata = extractMetadataFromHtml(html, 'https://example.com/path');
  assert.equal(metadata.title, 'Fallback title');
  assert.equal(metadata.thumbnailUrl, 'https://cdn.example.com/og.png');
}

{
  const html = '<html><head><title>Only title</title></head></html>';
  const metadata = extractMetadataFromHtml(html, 'https://example.com/path');
  assert.equal(metadata.title, 'Only title');
  assert.equal(metadata.thumbnailUrl, '');
}

{
  assert.throws(() => assertSafeFetchTarget(new URL('http://127.0.0.1/internal')), /not allowed/);
  assert.throws(() => assertSafeFetchTarget(new URL('http://localhost/internal')), /not allowed/);
  assert.throws(() => assertSafeFetchTarget(new URL('http://[::1]/internal')), /not allowed/);
  assert.throws(() => assertSafeFetchTarget(new URL('http://[::]/internal')), /not allowed/);

  assert.doesNotThrow(() => assertSafeFetchTarget(new URL('https://example.com/public')));
}

{
  const originalFetch = globalThis.fetch;
  let upstreamFetchCalls = 0;

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith('https://cloudflare-dns.com/dns-query?')) {
      const dnsUrl = new URL(url);
      if (dnsUrl.searchParams.get('type') === 'A') {
        return new Response(
          JSON.stringify({
            Status: 0,
            Answer: [{ name: 'example.com', type: 1, data: '93.184.216.34' }],
          }),
          { status: 200, headers: { 'content-type': 'application/dns-json' } },
        );
      }

      return new Response(
        JSON.stringify({
          Status: 0,
          Answer: [{ name: 'example.com', type: 28, data: '::' }],
        }),
        { status: 200, headers: { 'content-type': 'application/dns-json' } },
      );
    }

    upstreamFetchCalls += 1;
    return new Response('<html><head><title>ok</title></head></html>', {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  }) as typeof fetch;

  try {
    await assert.rejects(fetchPageMetadata('https://example.com/blocked'), /url host is not allowed/);
    assert.equal(upstreamFetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

{
  const originalFetch = globalThis.fetch;
  let upstreamFetchCalls = 0;

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith('https://cloudflare-dns.com/dns-query?')) {
      return new Response(
        JSON.stringify({
          Status: 0,
          Answer: [{ type: 5, data: 'alias.example.net' }],
        }),
        { status: 200, headers: { 'content-type': 'application/dns-json' } },
      );
    }

    upstreamFetchCalls += 1;
    return new Response('<html><head><title>ok</title></head></html>', {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  }) as typeof fetch;

  try {
    await assert.rejects(fetchPageMetadata('https://example.com/cname-only'), /failed to resolve upstream host/);
    assert.equal(upstreamFetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

{
  const originalFetch = globalThis.fetch;
  let upstreamFetchCalls = 0;

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith('https://cloudflare-dns.com/dns-query?')) {
      const dnsUrl = new URL(url);
      if (dnsUrl.searchParams.get('type') === 'A') {
        return new Response(
          JSON.stringify({
            Status: 0,
            Answer: [
              { type: 1, data: '93.184.216.34' },
              { type: 5, data: 'alias.example.net' },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/dns-json' } },
        );
      }

      return new Response(JSON.stringify({ Status: 0, Answer: [] }), {
        status: 200,
        headers: { 'content-type': 'application/dns-json' },
      });
    }

    upstreamFetchCalls += 1;
    return new Response('<html><head><title>ok</title></head></html>', {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  }) as typeof fetch;

  try {
    await assert.rejects(fetchPageMetadata('https://example.com/mixed-answer-types'), /failed to resolve upstream host/);
    assert.equal(upstreamFetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

{
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
    await assert.rejects(fetchPageMetadata('https://example.com/slow'), /upstream timeout/);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

{
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
    await assert.rejects(fetchPageMetadata('https://example.com/too-large-header'), /response too large/);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

{
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

    const tooLargeChunk = new Uint8Array(256 * 1024 + 10);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(tooLargeChunk);
        controller.close();
      },
    });

    return new Response(stream, {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  }) as typeof fetch;

  try {
    await assert.rejects(fetchPageMetadata('https://example.com/too-large-stream'), /response too large/);
  } finally {
    globalThis.fetch = originalFetch;
  }
}
