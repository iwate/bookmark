export type BookmarkRecord = {
  id: number;
  url: string;
  title: string | null;
  thumbnail_url: string | null;
  comment: string | null;
  created_at: string;
};

export type Bookmark = {
  id: number;
  url: string;
  title: string;
  thumbnailUrl: string;
  comment: string;
  createdAt: string;
};

export function toBookmark(record: BookmarkRecord): Bookmark {
  return {
    id: record.id,
    url: record.url,
    title: record.title ?? '',
    thumbnailUrl: record.thumbnail_url ?? '',
    comment: record.comment ?? '',
    createdAt: record.created_at,
  };
}
