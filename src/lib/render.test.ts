import assert from 'node:assert/strict';
import { renderIndexPage, renderRssFeed } from './render.ts';

{
  const html = renderIndexPage({
    page: 0,
    bookmarks: [
      {
        id: 1,
        title: 'Example title',
        url: 'https://example.com/?q=<script>',
        thumbnailUrl: 'https://example.com/image?x="y"',
        comment: '<b>comment</b>',
        createdAt: '2026-06-05T00:00:00.000Z',
      },
    ],
  });

  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('&lt;b&gt;comment&lt;/b&gt;'));
  assert.ok(!html.includes('https://example.com/?q=<script>'));
}

{
  const xml = renderRssFeed(
    [
      { id: 2, title: 'Second entry', url: 'https://example.com/2', thumbnailUrl: '', comment: 'second', createdAt: '2026-06-05T01:00:00.000Z' },
      { id: 1, title: '', url: 'https://example.com/1', thumbnailUrl: '', comment: 'first', createdAt: '2026-06-05T00:00:00.000Z' },
    ],
    'https://bookmark.example',
  );

  assert.ok(xml.indexOf('https://example.com/2') < xml.indexOf('https://example.com/1'));
  assert.ok(xml.includes('<title>Second entry</title>'));
  assert.ok(xml.includes('<title>https://example.com/1</title>'));
}

{
  const html = renderIndexPage({
    page: 0,
    bookmarks: [
      {
        id: 7,
        title: 'Current title',
        url: 'https://example.com/current',
        thumbnailUrl: 'https://example.com/current.png',
        comment: 'current comment',
        createdAt: '2026-06-05T00:00:00.000Z',
      },
    ],
  });

  assert.ok(html.includes('href="/?edit=7#editor"'));
  assert.ok(html.includes('Edit/Delete entry 7'));
  assert.ok(html.includes('Current title'));
  assert.ok(!html.includes('<details>'));
  assert.ok(!html.includes('action="/bookmarks/7/update"'));
  assert.ok(!html.includes('action="/bookmarks/7/delete"'));
}

{
  const html = renderIndexPage({
    page: 0,
    bookmarks: [
      {
        id: 9,
        title: '',
        url: 'https://example.com/original',
        thumbnailUrl: '',
        comment: '',
        createdAt: '2026-06-05T00:00:00.000Z',
      },
    ],
    editor: {
      id: 9,
      values: {
        url: 'https://example.com/edited',
        thumbnailUrl: 'https://example.com/thumb.png',
        comment: 'edited comment',
        title: 'edited title',
        secret: 'should-not-appear',
      },
      errors: [
        { field: 'url', message: 'must be a valid URL' },
        { field: 'secret', message: 'is invalid' },
      ],
    },
  });

  assert.ok(html.includes('https://example.com/edited'));
  assert.ok(html.includes('edited title'));
  assert.ok(html.includes('Editing #9'));
  assert.ok(html.includes('action="/bookmarks/9/update"'));
  assert.ok(html.includes('formaction="/bookmarks/9/delete"'));
  assert.ok(html.includes('formmethod="post"'));
  assert.ok(html.includes('formnovalidate'));
  assert.ok(html.includes('Update'));
  assert.ok(html.includes('Delete'));
  assert.ok(html.includes('Cancel edit'));
  assert.ok(html.includes('must be a valid URL'));
  assert.ok(html.includes('is invalid'));
  assert.equal((html.match(/<form\b/g) ?? []).length, 1);
  assert.equal((html.match(/name="password"/g) ?? []).length, 1);
  assert.ok(!html.includes('should-not-appear'));
}

{
  const html = renderIndexPage({ page: 0, bookmarks: [] });
  assert.ok(html.includes('id="metadata-status"'));
  assert.ok(html.includes("fetch('/bookmarks/metadata'"));
  assert.ok(html.includes('Metadata fetch failed. You can continue with manual input.'));
  assert.ok(html.includes('lastSuccessfulUrl'));
}

{
  const html = renderIndexPage({ page: 0, bookmarks: [] });
  const scriptMatch = html.match(/<script>\s*([\s\S]*?)\s*<\/script>/i);
  assert.ok(scriptMatch, 'page should include inline metadata script');

  class MockInput {
    value = '';
    private listeners: Record<string, Array<() => void>> = {};

    addEventListener(type: string, listener: () => void): void {
      this.listeners[type] ??= [];
      this.listeners[type].push(listener);
    }

    dispatch(type: string): void {
      for (const listener of this.listeners[type] ?? []) {
        listener();
      }
    }
  }

  class MockForm {
    private listeners: Record<string, Array<() => void>> = {};
    urlInput = new MockInput();
    titleInput = new MockInput();
    thumbnailInput = new MockInput();

    querySelector(selector: string): unknown {
      if (selector === 'input[name="url"]') {
        return this.urlInput;
      }
      if (selector === 'input[name="title"]') {
        return this.titleInput;
      }
      if (selector === 'input[name="thumbnailUrl"]') {
        return this.thumbnailInput;
      }
      return null;
    }

    addEventListener(type: string, listener: () => void): void {
      this.listeners[type] ??= [];
      this.listeners[type].push(listener);
    }
  }

  class MockElement {
    textContent = '';
    classList = {
      toggle: (_name: string, _enabled: boolean) => {},
    };
  }

  const form = new MockForm();
  const statusNode = new MockElement();
  form.urlInput.value = 'https://example.com/retry';

  const originalDocument = globalThis.document;
  const originalFetch = globalThis.fetch;
  const originalHTMLFormElement = globalThis.HTMLFormElement;
  const originalHTMLInputElement = globalThis.HTMLInputElement;
  const originalHTMLElement = globalThis.HTMLElement;

  let fetchCalls = 0;

  globalThis.HTMLFormElement = MockForm as unknown as typeof HTMLFormElement;
  globalThis.HTMLInputElement = MockInput as unknown as typeof HTMLInputElement;
  globalThis.HTMLElement = MockElement as unknown as typeof HTMLElement;
  globalThis.document = {
    querySelector: (selector: string) => (selector === '#editor form' ? form : null),
    getElementById: (id: string) => (id === 'metadata-status' ? statusNode : null),
  } as unknown as Document;
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    return new Response('upstream down', { status: 502 });
  }) as typeof fetch;

  try {
    assert.ok(scriptMatch[1], 'inline script body must be present');
    const runInlineScript = new Function(scriptMatch[1]);
    runInlineScript();

    form.urlInput.dispatch('blur');
    await new Promise((resolve) => setTimeout(resolve, 0));
    form.urlInput.dispatch('blur');
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(fetchCalls, 2);
  } finally {
    globalThis.document = originalDocument;
    globalThis.fetch = originalFetch;
    globalThis.HTMLFormElement = originalHTMLFormElement;
    globalThis.HTMLInputElement = originalHTMLInputElement;
    globalThis.HTMLElement = originalHTMLElement;
  }
}
