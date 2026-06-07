import { Hono } from 'hono';
import type { BookmarkInput, ValidationError } from './utils/validation.ts';
import { validateBookmarkInput } from './utils/validation.ts';
import { createBookmark, deleteBookmarkById, listBookmarks, updateBookmarkById, type D1DatabaseLike } from './lib/bookmark-store.ts';
import { fetchPageMetadata, mapMetadataError } from './lib/metadata.ts';
import { renderIndexPage, renderRssFeed } from './lib/render.ts';

type Env = {
  DB: D1DatabaseLike;
  WRITE_SECRET: string;
};

type FormPayload = BookmarkInput & { password?: string };
type MetadataPayload = { url: string };

const PAGE_SIZE = 20;

const app = new Hono<{ Bindings: Env }>();

class BadRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BadRequestError';
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasDatabaseBinding(db: unknown): db is D1DatabaseLike {
  return typeof db === 'object' && db !== null && 'prepare' in db && typeof db.prepare === 'function';
}

function ensureReadRuntimeConfig(c: { env: Partial<Env> }) {
  if (!hasDatabaseBinding(c.env.DB)) {
    return new Response('server misconfigured', { status: 500 });
  }
  return null;
}

function ensureWriteRuntimeConfig(c: { env: Partial<Env> }) {
  const dbError = ensureReadRuntimeConfig(c);
  if (dbError) {
    return dbError;
  }
  if (typeof c.env.WRITE_SECRET !== 'string' || c.env.WRITE_SECRET.length === 0) {
    return new Response('server misconfigured', { status: 500 });
  }
  return null;
}

function isDisallowedWriteRequest(request: Request, requestUrl: string): boolean {
  const secFetchSite = (request.headers.get('sec-fetch-site') ?? '').toLowerCase();
  if (secFetchSite === 'cross-site') {
    return true;
  }

  const origin = request.headers.get('origin');
  if (!origin) {
    return false;
  }

  try {
    const requestOrigin = new URL(requestUrl).origin;
    const originHeader = new URL(origin).origin;
    return originHeader !== requestOrigin;
  } catch {
    return true;
  }
}

function parseBookmarkId(rawId: string): number | null {
  if (!/^\d+$/.test(rawId)) {
    return null;
  }
  const id = Number(rawId);
  if (!Number.isSafeInteger(id) || id <= 0) {
    return null;
  }
  return id;
}

async function readPayload(request: Request): Promise<FormPayload> {
  const contentType = (request.headers.get('content-type') ?? '').toLowerCase();

  if (contentType.includes('application/json')) {
    let json: unknown;
    try {
      json = await request.json();
    } catch {
      throw new BadRequestError('invalid request body');
    }

    if (!isPlainObject(json)) {
      throw new BadRequestError('invalid request body');
    }

    return {
      url: String(json.url ?? ''),
      thumbnailUrl: String(json.thumbnailUrl ?? ''),
      comment: String(json.comment ?? ''),
      title: String(json.title ?? ''),
      password: String(json.password ?? ''),
    };
  }

  if (!contentType.includes('application/x-www-form-urlencoded') && !contentType.includes('multipart/form-data')) {
    throw new BadRequestError('unsupported content type');
  }

  let data: FormData;
  try {
    data = await request.formData();
  } catch {
    throw new BadRequestError('invalid request body');
  }

  return {
    url: String(data.get('url') ?? ''),
    thumbnailUrl: String(data.get('thumbnailUrl') ?? ''),
    comment: String(data.get('comment') ?? ''),
    title: String(data.get('title') ?? ''),
    password: String(data.get('password') ?? ''),
  };
}

async function readMetadataPayload(request: Request): Promise<MetadataPayload> {
  const contentType = (request.headers.get('content-type') ?? '').toLowerCase();
  if (!contentType.includes('application/json')) {
    throw new BadRequestError('unsupported content type');
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    throw new BadRequestError('invalid request body');
  }

  if (!isPlainObject(json)) {
    throw new BadRequestError('invalid request body');
  }

  return { url: String(json.url ?? '') };
}

function renderPage(page: number, bookmarks: Awaited<ReturnType<typeof listBookmarks>>, values?: FormPayload, errors = []) {
  return renderIndexPage({
    page,
    bookmarks,
    values: {
      url: values?.url ?? '',
      thumbnailUrl: values?.thumbnailUrl ?? '',
      comment: values?.comment ?? '',
      title: values?.title ?? '',
      secret: '',
    },
    errors,
  });
}

function renderPageWithEditor(
  page: number,
  bookmarks: Awaited<ReturnType<typeof listBookmarks>>,
  entryId: number,
  payload: FormPayload | undefined,
  errors: ValidationError[],
) {
  const entry = bookmarks.find((bookmark) => bookmark.id === entryId);
  const values = {
    url: payload?.url ?? entry?.url ?? '',
    thumbnailUrl: payload?.thumbnailUrl ?? entry?.thumbnailUrl ?? '',
    comment: payload?.comment ?? entry?.comment ?? '',
    title: payload?.title ?? entry?.title ?? '',
    secret: '',
  };

  return renderIndexPage({
    page,
    bookmarks,
    values: {
      url: '',
      thumbnailUrl: '',
      comment: '',
      title: '',
      secret: '',
    },
    errors: [],
    editor: {
      id: entryId,
      values,
      errors,
    },
  });
}

app.get('/', async (c) => {
  const configError = ensureReadRuntimeConfig(c);
  if (configError) {
    return configError;
  }

  const page = Number(new URL(c.req.url).searchParams.get('page') ?? '0');

  try {
    const bookmarks = await listBookmarks(c.env.DB, page, PAGE_SIZE);
    const rawEditId = new URL(c.req.url).searchParams.get('edit');
    const editId = rawEditId ? parseBookmarkId(rawEditId) : null;
    if (editId === null) {
      return c.html(renderPage(page, bookmarks));
    }

    const entry = bookmarks.find((bookmark) => bookmark.id === editId);
    if (!entry) {
      return c.html(renderPage(page, bookmarks));
    }

    return c.html(
      renderIndexPage({
        page,
        bookmarks,
        editor: {
          id: entry.id,
          values: {
            url: entry.url,
            thumbnailUrl: entry.thumbnailUrl,
            comment: entry.comment,
            title: entry.title,
            secret: '',
          },
          errors: [],
        },
      }),
    );
  } catch {
    return c.text('internal server error', 500);
  }
});

app.get('/rss.xml', async (c) => {
  const configError = ensureReadRuntimeConfig(c);
  if (configError) {
    return configError;
  }

  try {
    const bookmarks = await listBookmarks(c.env.DB, 0, PAGE_SIZE);
    const siteUrl = new URL(c.req.url).origin;
    return c.text(renderRssFeed(bookmarks, siteUrl), 200, {
      'Content-Type': 'application/rss+xml; charset=utf-8',
    });
  } catch {
    return c.text('internal server error', 500);
  }
});

app.post('/bookmarks/metadata', async (c) => {
  if (isDisallowedWriteRequest(c.req.raw, c.req.url)) {
    return c.text('forbidden', 403);
  }

  let payload: MetadataPayload;
  try {
    payload = await readMetadataPayload(c.req.raw);
  } catch (error) {
    if (error instanceof BadRequestError) {
      return c.text(error.message, 400);
    }
    return c.text('invalid request body', 400);
  }

  try {
    const metadata = await fetchPageMetadata(payload.url);
    return c.json(metadata);
  } catch (error) {
    const mapped = mapMetadataError(error);
    return c.text(mapped.message, mapped.status);
  }
});

app.post('/bookmarks', async (c) => {
  const configError = ensureWriteRuntimeConfig(c);
  if (configError) {
    return configError;
  }

  if (isDisallowedWriteRequest(c.req.raw, c.req.url)) {
    return c.text('forbidden', 403);
  }

  let payload: FormPayload;
  try {
    payload = await readPayload(c.req.raw);
  } catch (error) {
    if (error instanceof BadRequestError) {
      return c.text(error.message, 400);
    }
    return c.text('invalid request body', 400);
  }

  if (!c.env.WRITE_SECRET || payload.password !== c.env.WRITE_SECRET) {
    try {
      const bookmarks = await listBookmarks(c.env.DB, 0, PAGE_SIZE);
      return c.html(renderPage(0,bookmarks, payload, [{ field: 'password', message: 'is invalid' }]), 403);
    } catch {
      return c.text('internal server error', 500);
    }
  }

  const result = validateBookmarkInput(payload);
  if (!result.ok) {
    try {
      const bookmarks = await listBookmarks(c.env.DB, 0, PAGE_SIZE);
      return c.html(renderPage(0, bookmarks, payload, result.errors), 400);
    } catch {
      return c.text('internal server error', 500);
    }
  }

  try {
    await createBookmark(c.env.DB, result.value);
    return c.redirect('/');
  } catch {
    return c.text('internal server error', 500);
  }
});

app.post('/bookmarks/:id/update', async (c) => {
  const configError = ensureWriteRuntimeConfig(c);
  if (configError) {
    return configError;
  }

  if (isDisallowedWriteRequest(c.req.raw, c.req.url)) {
    return c.text('forbidden', 403);
  }

  const bookmarkId = parseBookmarkId(c.req.param('id'));
  if (bookmarkId === null) {
    return c.text('not found', 404);
  }

  let payload: FormPayload;
  try {
    payload = await readPayload(c.req.raw);
  } catch (error) {
    if (error instanceof BadRequestError) {
      return c.text(error.message, 400);
    }
    return c.text('invalid request body', 400);
  }

  if (!c.env.WRITE_SECRET || payload.password !== c.env.WRITE_SECRET) {
    try {
      const bookmarks = await listBookmarks(c.env.DB, 0, PAGE_SIZE);
      return c.html(renderPageWithEditor(0, bookmarks, bookmarkId, payload, [{ field: 'secret', message: 'is invalid' }]), 403);
    } catch {
      return c.text('internal server error', 500);
    }
  }

  const result = validateBookmarkInput(payload);
  if (!result.ok) {
    try {
      const bookmarks = await listBookmarks(c.env.DB, 0, PAGE_SIZE);
      return c.html(renderPageWithEditor(0, bookmarks, bookmarkId, payload, result.errors), 400);
    } catch {
      return c.text('internal server error', 500);
    }
  }

  try {
    const updated = await updateBookmarkById(c.env.DB, bookmarkId, result.value);
    if (!updated) {
      return c.text('not found', 404);
    }
    return c.redirect('/');
  } catch {
    return c.text('internal server error', 500);
  }
});

app.post('/bookmarks/:id/delete', async (c) => {
  const configError = ensureWriteRuntimeConfig(c);
  if (configError) {
    return configError;
  }

  if (isDisallowedWriteRequest(c.req.raw, c.req.url)) {
    return c.text('forbidden', 403);
  }

  const bookmarkId = parseBookmarkId(c.req.param('id'));
  if (bookmarkId === null) {
    return c.text('not found', 404);
  }

  let payload: FormPayload;
  try {
    payload = await readPayload(c.req.raw);
  } catch (error) {
    if (error instanceof BadRequestError) {
      return c.text(error.message, 400);
    }
    return c.text('invalid request body', 400);
  }

  if (!c.env.WRITE_SECRET || payload.password !== c.env.WRITE_SECRET) {
    try {
      const bookmarks = await listBookmarks(c.env.DB, 0, PAGE_SIZE);
      return c.html(renderPageWithEditor(0, bookmarks, bookmarkId, undefined, [{ field: 'secret', message: 'is invalid' }]), 403);
    } catch {
      return c.text('internal server error', 500);
    }
  }

  try {
    const deleted = await deleteBookmarkById(c.env.DB, bookmarkId);
    if (!deleted) {
      return c.text('not found', 404);
    }
    return c.redirect('/');
  } catch {
    return c.text('internal server error', 500);
  }
});

export default app;
