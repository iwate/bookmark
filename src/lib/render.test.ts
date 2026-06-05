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

{
  const html = renderIndexPage({
    bookmarks: [
      {
        id: 7,
        url: 'https://example.com/current',
        thumbnailUrl: 'https://example.com/current.png',
        comment: 'current comment',
        createdAt: '2026-06-05T00:00:00.000Z',
      },
    ],
  });

  assert.ok(html.includes('action="/bookmarks/7/update"'));
  assert.ok(html.includes('action="/bookmarks/7/delete"'));
  assert.ok(html.includes('name="secret"'));
}

{
  const html = renderIndexPage({
    bookmarks: [
      {
        id: 9,
        url: 'https://example.com/original',
        thumbnailUrl: '',
        comment: '',
        createdAt: '2026-06-05T00:00:00.000Z',
      },
    ],
    entryForms: {
      9: {
        values: {
          url: 'https://example.com/edited',
          thumbnailUrl: 'https://example.com/thumb.png',
          comment: 'edited comment',
          secret: 'should-not-appear',
        },
        errors: [
          { field: 'url', message: 'must be a valid URL' },
          { field: 'secret', message: 'is invalid' },
        ],
      },
    },
  });

  assert.ok(html.includes('https://example.com/edited'));
  assert.ok(html.includes('must be a valid URL'));
  assert.ok(html.includes('is invalid'));
  assert.ok(!html.includes('should-not-appear'));
}
