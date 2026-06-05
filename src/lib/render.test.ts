import assert from 'node:assert/strict';
import { renderIndexPage, renderRssFeed } from './render.ts';

{
  const html = renderIndexPage({
    bookmarks: [
      {
        id: 1,
        url: 'https://example.com/?q=<script>',
        thumbnailUrl: 'https://example.com/image?x="y"',
        comment: '<b>comment</b>',
        createdAt: '2026-06-05T00:00:00.000Z',
      },
    ],
  });

  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('&lt;b&gt;comment&lt;/b&gt;'));
  assert.ok(!html.includes('<script>'));
}

{
  const xml = renderRssFeed(
    [
      { id: 2, url: 'https://example.com/2', thumbnailUrl: '', comment: 'second', createdAt: '2026-06-05T01:00:00.000Z' },
      { id: 1, url: 'https://example.com/1', thumbnailUrl: '', comment: 'first', createdAt: '2026-06-05T00:00:00.000Z' },
    ],
    'https://bookmark.example',
  );

  assert.ok(xml.indexOf('https://example.com/2') < xml.indexOf('https://example.com/1'));
}
