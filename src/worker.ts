import { Hono } from 'hono';
import type { BookmarkInput } from './utils/validation.ts';
import { validateBookmarkInput } from './utils/validation.ts';
import { createBookmark, listBookmarks, type D1DatabaseLike } from './lib/bookmark-store.ts';
import { renderIndexPage, renderRssFeed } from './lib/render.ts';

type Env = {
  DB: D1DatabaseLike;
  WRITE_SECRET: string;
};

type FormPayload = BookmarkInput & { secret?: string };

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

function ensureRuntimeConfig(c: { env: Partial<Env> }) {
  if (!hasDatabaseBinding(c.env.DB)) {
    return new Response('server misconfigured', { status: 500 });
  }
  if (typeof c.env.WRITE_SECRET !== 'string' || c.env.WRITE_SECRET.length === 0) {
    return new Response('server misconfigured', { status: 500 });
  }
  return null;
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
      secret: String(json.secret ?? ''),
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
    secret: String(data.get('secret') ?? ''),
  };
}

function renderPage(bookmarks: Awaited<ReturnType<typeof listBookmarks>>, values?: FormPayload, errors = []) {
  return renderIndexPage({
    bookmarks,
    values: {
      url: values?.url ?? '',
      thumbnailUrl: values?.thumbnailUrl ?? '',
      comment: values?.comment ?? '',
      secret: '',
    },
    errors,
  });
}

app.get('/', async (c) => {
  const configError = ensureRuntimeConfig(c);
  if (configError) {
    return configError;
  }

  try {
    const bookmarks = await listBookmarks(c.env.DB);
    return c.html(renderPage(bookmarks));
  } catch {
    return c.text('internal server error', 500);
  }
});

app.get('/rss.xml', async (c) => {
  const configError = ensureRuntimeConfig(c);
  if (configError) {
    return configError;
  }

  try {
    const bookmarks = await listBookmarks(c.env.DB);
    const siteUrl = new URL(c.req.url).origin;
    return c.text(renderRssFeed(bookmarks, siteUrl), 200, {
      'Content-Type': 'application/rss+xml; charset=utf-8',
    });
  } catch {
    return c.text('internal server error', 500);
  }
});

app.post('/bookmarks', async (c) => {
  const configError = ensureRuntimeConfig(c);
  if (configError) {
    return configError;
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

  if (!c.env.WRITE_SECRET || payload.secret !== c.env.WRITE_SECRET) {
    try {
      const bookmarks = await listBookmarks(c.env.DB);
      return c.html(renderPage(bookmarks, payload, [{ field: 'secret', message: 'is invalid' }]), 403);
    } catch {
      return c.text('internal server error', 500);
    }
  }

  const result = validateBookmarkInput(payload);
  if (!result.ok) {
    try {
      const bookmarks = await listBookmarks(c.env.DB);
      return c.html(renderPage(bookmarks, payload, result.errors), 400);
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

export default app;
