import type { Bookmark } from './bookmarks.ts';
import type { ValidationError } from '../utils/validation.ts';

type RenderPageInput = {
  bookmarks: Bookmark[];
  errors?: ValidationError[];
  values?: {
    url: string;
    thumbnailUrl: string;
    comment: string;
    title: string;
    secret: string;
  };
  editor?: {
    id: number;
    values?: {
      url: string;
      thumbnailUrl: string;
      comment: string;
      title: string;
      secret: string;
    };
    errors?: ValidationError[];
  };
};

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeXml(value: string): string {
  return escapeHtml(value);
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('en-US', { timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'short' });
}

function renderErrors(errors: ValidationError[]): string {
  if (errors.length === 0) {
    return '';
  }

  return `
    <ul class="errors" aria-live="polite">
      ${errors
        .map((error) => `<li><strong>${escapeHtml(String(error.field))}</strong> ${escapeHtml(error.message)}</li>`)
        .join('')}
    </ul>
  `;
}

function renderBookmark(bookmark: Bookmark): string {
  const displayTitle = bookmark.title || bookmark.url;

  const thumbnail = bookmark.thumbnailUrl
    ? `<img src="${escapeHtml(bookmark.thumbnailUrl)}" alt="" loading="lazy" decoding="async">`
    : '';

  const comment = bookmark.comment
    ? `<p class="comment">${escapeHtml(bookmark.comment)}</p>`
    : '';

  return `
    <li class="bookmark">
      ${thumbnail}
      <p class="bookmark-title">
        <a class="bookmark-url" href="${escapeHtml(bookmark.url)}" target="_blank" rel="noreferrer">${escapeHtml(displayTitle)}</a>
      </p>
      ${comment}
      <time datetime="${escapeHtml(bookmark.createdAt)}">${escapeHtml(formatDate(bookmark.createdAt))}</time>
      <p class="bookmark-action-wrap">
        <a class="bookmark-action" href="/?edit=${bookmark.id}#editor" aria-label="Edit/Delete entry ${bookmark.id}">Edit/Delete</a>
      </p>
    </li>
  `;
}

export function renderIndexPage(input: RenderPageInput): string {
  const editorValues = input.editor?.values;
  const sourceValues = editorValues ?? input.values ?? { url: '', thumbnailUrl: '', comment: '', title: '', secret: '' };
  const values = {
    url: sourceValues.url,
    thumbnailUrl: sourceValues.thumbnailUrl,
    comment: sourceValues.comment,
    title: sourceValues.title,
    secret: '',
  };
  const isEditing = typeof input.editor?.id === 'number';
  const formAction = isEditing ? `/bookmarks/${input.editor?.id}/update` : '/bookmarks';
  const submitLabel = isEditing ? 'Update' : 'Save';
  const sectionHeading = isEditing ? 'Edit bookmark' : 'Save a bookmark';
  const formErrors = isEditing ? input.editor?.errors ?? [] : input.errors ?? [];
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>きになるなるなる</title>
    <link rel="manifest" href="/manifest.json">
    <meta name="theme-color" content="#333333">
    <style>
      :root { color-scheme: light; }
      body { margin: 0; font: 16px/1.5 system-ui, sans-serif; background: #f5f1e8; color: #1f2937; }
      main { max-width: 44rem; margin: 0 auto; padding: 2rem 1rem 4rem; }
      header { margin-bottom: 1.5rem; }
      h1 { margin: 0 0 0.25rem; font-size: 2rem; }
      .subtle { color: #6b7280; margin: 0; }
      form, .bookmark { background: #fff; border: 1px solid #e5e7eb; border-radius: 0.75rem; padding: 1rem; box-shadow: 0 1px 2px rgba(0,0,0,0.04); }
      form { display: grid; gap: 0.75rem; margin-bottom: 1.5rem; }
      label { display: grid; gap: 0.35rem; font-weight: 600; }
      input, textarea, button { font: inherit; }
      input, textarea { border: 1px solid #d1d5db; border-radius: 0.5rem; padding: 0.7rem 0.8rem; }
      textarea { min-height: 6rem; resize: vertical; }
      button { border: 0; border-radius: 999px; padding: 0.8rem 1rem; background: #111827; color: #fff; font-weight: 700; width: fit-content; }
      .button-secondary { background: #4b5563; }
      .form-actions { display: flex; gap: 0.75rem; flex-wrap: wrap; align-items: center; }
      .errors { margin: 0; padding-left: 1.2rem; color: #b91c1c; }
      .metadata-status { margin: 0; color: #6b7280; min-height: 1.25rem; }
      .metadata-status.error { color: #b91c1c; }
      .bookmarks { list-style: none; margin: 0; padding: 0; display: grid; gap: 1rem; }
      .bookmark { display: grid; gap: 0.65rem; }
      .bookmark-title { grid-column: span 2; margin: 0; font-size: 1.1rem; font-weight: 700; overflow-wrap: anywhere; }
      .bookmark-url { font-weight: 700; overflow-wrap: anywhere; }
      .bookmark-action-wrap { grid-column: span 1; margin: 0; text-align: right; }
      .bookmark-action { color: #1f2937; font-weight: 700; }
      .cancel-edit { color: #1f2937; font-weight: 700; }
      img { grid-column: span 2; max-width: 100%; height: auto; border-radius: 0.5rem; }
      .comment { grid-column: span 2; margin: 0; white-space: pre-wrap; }
      time { grid-column: span 1; color: #6b7280; font-size: 0.92rem; }
      @media (max-width: 640px) { main { padding-inline: 0.75rem; } h1 { font-size: 1.7rem; } }
    </style>
  </head>
  <body>
    <main>
      <header>
        <h1>きになるなるなる</h1>
        <p class="subtle">@iwate's bookmarks</p>
      </header>
      <section id="editor">
        ${isEditing ? `<p class="subtle">Editing #${input.editor?.id}</p>` : ''}
        ${renderErrors(formErrors)}
        <form method="post" action="${formAction}">
          <label>
            URL
            <input type="url" name="url" required value="${escapeHtml(values.url)}" autocomplete="url">
          </label>
          <p id="metadata-status" class="metadata-status" aria-live="polite"></p>
          <label>
            Title
            <input type="text" name="title" maxlength="300" value="${escapeHtml(values.title)}" autocomplete="off">
          </label>
          <label>
            Thumbnail URL
            <input type="url" name="thumbnailUrl" value="${escapeHtml(values.thumbnailUrl)}" autocomplete="off">
          </label>
          <label>
            Comment
            <textarea name="comment">${escapeHtml(values.comment)}</textarea>
          </label>
          <label>
            Secret
            <input type="password" name="secret" required value="${escapeHtml(values.secret)}">
          </label>
          <div class="form-actions">
            <button type="submit">${submitLabel}</button>
            ${
              isEditing
                ? `<button
                    type="submit"
                    class="button-secondary"
                    formaction="/bookmarks/${input.editor?.id}/delete"
                    formmethod="post"
                    formnovalidate
                    onclick="return confirm('Delete this bookmark?');"
                  >Delete</button>
                  <a class="cancel-edit" href="/#editor">Cancel edit</a>`
                : ''
            }
          </div>
        </form>
      </section>
      <section id="collection">
        <ol class="bookmarks">
          ${input.bookmarks.map((bookmark) => renderBookmark(bookmark)).join('') || '<li>No bookmarks yet.</li>'}
        </ol>
      </section>
    </main>
    <script>
      (() => {
        const form = document.querySelector('#editor form');
        if (!(form instanceof HTMLFormElement)) {
          return;
        }
        
        const urlInput = form.querySelector('input[name="url"]');
        const titleInput = form.querySelector('input[name="title"]');
        const thumbnailInput = form.querySelector('input[name="thumbnailUrl"]');
        const statusNode = document.getElementById('metadata-status');

        if (!(urlInput instanceof HTMLInputElement) || !(titleInput instanceof HTMLInputElement) || !(thumbnailInput instanceof HTMLInputElement)) {
          return;
        }

        let pendingController = null;
        let pendingUrl = '';
        let lastSuccessfulUrl = '';

        const setStatus = (message, isError) => {
          if (!(statusNode instanceof HTMLElement)) {
            return;
          }
          statusNode.textContent = message;
          statusNode.classList.toggle('error', Boolean(isError));
        };

        const shouldAutofill = () => titleInput.value.trim() === '' || thumbnailInput.value.trim() === '';

        const fetchMetadata = async () => {
          const url = urlInput.value.trim();
          if (!url || !shouldAutofill() || url === lastSuccessfulUrl) {
            return;
          }
          if (pendingController && pendingUrl === url) {
            return;
          }

          if (pendingController) {
            pendingController.abort();
          }
          pendingController = new AbortController();
          pendingUrl = url;

          setStatus('Fetching metadata...', false);

          try {
            const response = await fetch('/bookmarks/metadata', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ url }),
              signal: pendingController.signal,
            });

            if (!response.ok) {
              const text = (await response.text()).trim();
              throw new Error(text || 'metadata fetch failed');
            }

            const data = await response.json();
            if (titleInput.value.trim() === '' && typeof data.title === 'string' && data.title.trim() !== '') {
              titleInput.value = data.title.trim();
            }
            if (thumbnailInput.value.trim() === '' && typeof data.thumbnailUrl === 'string' && data.thumbnailUrl.trim() !== '') {
              thumbnailInput.value = data.thumbnailUrl.trim();
            }

            lastSuccessfulUrl = url;
            setStatus('', false);
          } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') {
              return;
            }
            setStatus('Metadata fetch failed. You can continue with manual input.', true);
          } finally {
            if (pendingUrl === url) {
              pendingUrl = '';
              pendingController = null;
            }
          }
        };

        urlInput.addEventListener('blur', () => {
          void fetchMetadata();
        });

        const searchParams = new URLSearchParams(globalThis.location?.search ?? '');
        const sharedUrl 
          = searchParams.get('url') 
          ?? searchParams.get('text')
          ?? searchParams.get('title');
        if (sharedUrl && sharedUrl.startsWith('https://')) {
          urlInput.value = sharedUrl;
          void fetchMetadata();
        }

        form.addEventListener('submit', () => {
          setStatus('', false);
        });
      })();
    </script>
    <script>
      if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
          navigator.serviceWorker.register('/service-worker.js')
            .then(registration => {
              console.log('SW registered: ', registration);
            })
            .catch(error => {
              console.error('SW registration failed: ', error);
            });
        });
      }
    </script>
  </body>
</html>`;
}

export function renderRssFeed(bookmarks: Bookmark[], siteUrl: string): string {
  const items = bookmarks
    .map(
      (bookmark) => `
        <item>
          <title>${escapeXml(bookmark.title || bookmark.url)}</title>
          <link>${escapeXml(bookmark.url)}</link>
          <guid isPermaLink="false">bookmark-${bookmark.id}</guid>
          <pubDate>${escapeXml(new Date(bookmark.createdAt).toUTCString())}</pubDate>
          <description>${escapeXml(bookmark.comment || bookmark.url)}</description>
        </item>
      `,
    )
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Bookmarks</title>
    <link>${escapeXml(siteUrl)}</link>
    <description>Newest saved bookmarks</description>
    ${items}
  </channel>
</rss>`;
}
