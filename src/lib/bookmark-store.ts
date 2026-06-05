import type { Bookmark, BookmarkRecord } from './bookmarks.ts';
import { toBookmark } from './bookmarks.ts';

export type D1DatabaseLike = {
  prepare(sql: string): {
    bind(...values: unknown[]): {
      all<T = unknown>(): Promise<{ results?: T[] }>;
      run(): Promise<{ meta?: { changes?: number } } | unknown>;
    };
  };
};

const BOOKMARK_SELECT_SQL = `
  SELECT id, url, title, thumbnail_url, comment, created_at
  FROM bookmarks
  ORDER BY created_at DESC, id DESC
`;

const BOOKMARK_INSERT_SQL = `
  INSERT INTO bookmarks (url, thumbnail_url, comment, title, created_at)
  VALUES (?, ?, ?, ?, ?)
`;

const BOOKMARK_UPDATE_SQL = `
  UPDATE bookmarks
  SET url = ?, thumbnail_url = ?, comment = ?, title = ?
  WHERE id = ?
`;

const BOOKMARK_DELETE_SQL = `
  DELETE FROM bookmarks
  WHERE id = ?
`;

function getChanges(result: unknown): number | null {
  if (typeof result !== 'object' || result === null || !('meta' in result)) {
    return null;
  }

  const meta = (result as { meta?: unknown }).meta;
  if (typeof meta !== 'object' || meta === null || !('changes' in meta)) {
    return null;
  }

  const changes = (meta as { changes?: unknown }).changes;
  return typeof changes === 'number' ? changes : null;
}

export async function listBookmarks(db: D1DatabaseLike): Promise<Bookmark[]> {
  const result = await db.prepare(BOOKMARK_SELECT_SQL).bind().all<BookmarkRecord>();
  return (result.results ?? []).map(toBookmark);
}

export async function createBookmark(
  db: D1DatabaseLike,
  bookmark: Pick<Bookmark, 'url' | 'thumbnailUrl' | 'comment' | 'title'>,
  createdAt = new Date().toISOString(),
): Promise<void> {
  await db
    .prepare(BOOKMARK_INSERT_SQL)
    .bind(bookmark.url, bookmark.thumbnailUrl || null, bookmark.comment || null, bookmark.title || null, createdAt)
    .run();
}

export async function updateBookmarkById(
  db: D1DatabaseLike,
  id: number,
  bookmark: Pick<Bookmark, 'url' | 'thumbnailUrl' | 'comment' | 'title'>,
): Promise<boolean> {
  const result = await db
    .prepare(BOOKMARK_UPDATE_SQL)
    .bind(bookmark.url, bookmark.thumbnailUrl || null, bookmark.comment || null, bookmark.title || null, id)
    .run();

  const changes = getChanges(result);
  return changes === null ? true : changes > 0;
}

export async function deleteBookmarkById(db: D1DatabaseLike, id: number): Promise<boolean> {
  const result = await db.prepare(BOOKMARK_DELETE_SQL).bind(id).run();
  const changes = getChanges(result);
  return changes === null ? true : changes > 0;
}
