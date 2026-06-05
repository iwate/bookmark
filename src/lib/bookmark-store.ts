import type { Bookmark, BookmarkRecord } from './bookmarks.ts';
import { toBookmark } from './bookmarks.ts';

export type D1DatabaseLike = {
  prepare(sql: string): {
    bind(...values: unknown[]): {
      all<T = unknown>(): Promise<{ results?: T[] }>;
      run(): Promise<unknown>;
    };
  };
};

const BOOKMARK_SELECT_SQL = `
  SELECT id, url, thumbnail_url, comment, created_at
  FROM bookmarks
  ORDER BY created_at DESC, id DESC
`;

const BOOKMARK_INSERT_SQL = `
  INSERT INTO bookmarks (url, thumbnail_url, comment, created_at)
  VALUES (?, ?, ?, ?)
`;

export async function listBookmarks(db: D1DatabaseLike): Promise<Bookmark[]> {
  const result = await db.prepare(BOOKMARK_SELECT_SQL).bind().all<BookmarkRecord>();
  return (result.results ?? []).map(toBookmark);
}

export async function createBookmark(
  db: D1DatabaseLike,
  bookmark: Pick<Bookmark, 'url' | 'thumbnailUrl' | 'comment'>,
  createdAt = new Date().toISOString(),
): Promise<void> {
  await db
    .prepare(BOOKMARK_INSERT_SQL)
    .bind(bookmark.url, bookmark.thumbnailUrl || null, bookmark.comment || null, createdAt)
    .run();
}
