import assert from 'node:assert/strict';
import { createBookmark, listBookmarks } from './bookmark-store.ts';

function createDbMock() {
  const calls = {
    prepare: 0,
    bind: [] as unknown[][],
    all: 0,
    run: 0,
  };
  const all = async () => {
    calls.all += 1;
    return { results: [] };
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
  mock.db.prepare = () => {
    mock.calls.prepare += 1;
    return {
      bind: (...values: unknown[]) => {
        mock.calls.bind.push(values);
        return {
          all: async () => {
            mock.calls.all += 1;
            return {
              results: [
                {
                  id: 1,
                  url: 'https://example.com',
                  thumbnail_url: null,
                  comment: 'hi',
                  created_at: '2026-06-05T00:00:00.000Z',
                },
              ],
            };
          },
          run: mock.run,
        };
      },
    };
  };

  const bookmarks = await listBookmarks(mock.db);

  assert.equal(mock.calls.prepare, 1);
  assert.equal(mock.calls.all, 1);
  assert.deepEqual(bookmarks, [
    {
      id: 1,
      url: 'https://example.com',
      thumbnailUrl: '',
      comment: 'hi',
      createdAt: '2026-06-05T00:00:00.000Z',
    },
  ]);
}

{
  const mock = createDbMock();

  await createBookmark(
    mock.db,
    {
      url: 'https://example.com',
      thumbnailUrl: '',
      comment: '',
    },
    '2026-06-05T00:00:00.000Z',
  );

  assert.equal(mock.calls.prepare, 1);
  assert.deepEqual(mock.calls.bind, [['https://example.com', null, null, '2026-06-05T00:00:00.000Z']]);
  assert.equal(mock.calls.run, 1);
}
