import assert from 'node:assert/strict';
import { assertSafeFetchTarget, extractMetadataFromHtml, fetchPageMetadata } from './metadata.ts';

class TestElement {
  private readonly attrs: Record<string, string>;

  constructor(attrs: Record<string, string>) {
    this.attrs = attrs;
  }

  getAttribute(name: string): string | null {
    return this.attrs[name] ?? null;
  }
}

type TextHandler = { text(text: { text: string }): void };
type ElementHandler = { element(element: TestElement): void };

class TestHtmlRewriter {
  private handlers = new Map<string, TextHandler | ElementHandler>();

  on(selector: string, handler: TextHandler | ElementHandler): TestHtmlRewriter {
    this.handlers.set(selector, handler);
    return this;
  }

  transform(response: Response): { arrayBuffer(): Promise<ArrayBuffer> } {
    return {
      arrayBuffer: async (): Promise<ArrayBuffer> => {
        const html = await response.text();

        const titleHandler = this.handlers.get('.entry-title *') as TextHandler | undefined;
        if (titleHandler) {
          const titleMatch = html.match(/<[^>]*class=["'][^"']*\bentry-title\b[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i);
          if (titleMatch) {
            const textContent = (titleMatch[1] ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
            if (textContent) {
              titleHandler.text({ text: textContent });
            }
          }
        }

        const thumbHandler = this.handlers.get('img.thumb') as ElementHandler | undefined;
        if (thumbHandler) {
          const imgMatch = html.match(/<img\b[^>]*class=["'][^"']*\bthumb\b[^"']*["'][^>]*>/i);
          if (imgMatch) {
            const srcMatch = imgMatch[0].match(/\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i);
            const src = srcMatch?.[1] ?? srcMatch?.[2] ?? srcMatch?.[3] ?? '';
            thumbHandler.element(new TestElement({ src }));
          }
        }

        return new ArrayBuffer(0);
      },
    };
  }
}

globalThis.HTMLRewriter = TestHtmlRewriter as unknown as typeof HTMLRewriter;

{
  const html = `
    <html>
      <body>
        <h1 class="entry-title"><a href="/post">OG title</a></h1>
        <img class="thumb" src="https://example.com/images/og.png">
      </body>
    </html>
  `;
  const metadata = await extractMetadataFromHtml(new Response(html));
  assert.equal(metadata.title, 'OG title');
  assert.equal(metadata.thumbnailUrl, 'og.png');
}

{
  const html = `
    <html>
      <body>
        <h2 class="entry-title">Fallback title</h2>
        <img class="thumb" src="https://cdn.example.com/cover%20image.jpg">
      </body>
    </html>
  `;
  const metadata = await extractMetadataFromHtml(new Response(html));
  assert.equal(metadata.title, 'Fallback title');
  assert.equal(metadata.thumbnailUrl, 'cover image.jpg');
}

{
  const html = '<html><body><p>Only body text</p></body></html>';
  const metadata = await extractMetadataFromHtml(new Response(html));
  assert.equal(metadata.title, '');
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
    const metadata = await fetchPageMetadata('https://example.com/mixed-answer-types');
    assert.deepEqual(metadata, { title: '', thumbnailUrl: '' });
    assert.equal(upstreamFetchCalls, 1);
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
    const metadata = await fetchPageMetadata('https://example.com/too-large-header');
    assert.deepEqual(metadata, { title: '', thumbnailUrl: '' });
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
    const metadata = await fetchPageMetadata('https://example.com/too-large-stream');
    assert.deepEqual(metadata, { title: '', thumbnailUrl: '' });
  } finally {
    globalThis.fetch = originalFetch;
  }
}
