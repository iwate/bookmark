export type BookmarkInput = {
  url: string;
  thumbnailUrl?: string;
  comment?: string;
  title?: string;
};

export type ValidationError = {
  field: keyof BookmarkInput | 'secret';
  message: string;
};

export type ValidationResult =
  | { ok: true; value: Required<BookmarkInput> }
  | { ok: false; errors: ValidationError[] };

const MAX_COMMENT_LENGTH = 500;
const MAX_TITLE_LENGTH = 300;
const MAX_URL_LENGTH = 2048;

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function validateHttpUrl(value: string, field: ValidationError['field']): ValidationError | null {
  if (value.length > MAX_URL_LENGTH) {
    return { field, message: `must be ${MAX_URL_LENGTH} characters or fewer` };
  }

  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return { field, message: 'must use http or https' };
    }
    if (url.username || url.password) {
      return { field, message: 'must not include username or password' };
    }
    return null;
  } catch {
    return { field, message: 'must be a valid URL' };
  }
}

export function validateBookmarkInput(input: BookmarkInput): ValidationResult {
  const errors: ValidationError[] = [];
  const url = normalizeText(input.url);
  const thumbnailUrl = normalizeText(input.thumbnailUrl);
  const comment = normalizeText(input.comment);
  const title = normalizeText(input.title);

  if (!url) {
    errors.push({ field: 'url', message: 'is required' });
  } else {
    const error = validateHttpUrl(url, 'url');
    if (error) errors.push(error);
  }

  if (thumbnailUrl) {
    const error = validateHttpUrl(thumbnailUrl, 'thumbnailUrl');
    if (error) errors.push(error);
  }

  if (comment.length > MAX_COMMENT_LENGTH) {
    errors.push({ field: 'comment', message: `must be ${MAX_COMMENT_LENGTH} characters or fewer` });
  }

  if (title.length > MAX_TITLE_LENGTH) {
    errors.push({ field: 'title', message: `must be ${MAX_TITLE_LENGTH} characters or fewer` });
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      url,
      thumbnailUrl,
      comment,
      title,
    },
  };
}