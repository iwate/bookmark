import assert from 'node:assert/strict';
import { validateBookmarkInput } from './validation.ts';

{
  const result = validateBookmarkInput({ url: 'https://example.com' });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.value, {
      url: 'https://example.com',
      thumbnailUrl: '',
      comment: '',
      title: '',
    });
  }
}

{
  const result = validateBookmarkInput({ url: '' });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.deepEqual(result.errors, [{ field: 'url', message: 'is required' }]);
  }
}

{
  const result = validateBookmarkInput({
    url: 'mailto:test@example.com',
    comment: 'a'.repeat(501),
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.deepEqual(result.errors, [
      { field: 'url', message: 'must use http or https' },
      { field: 'comment', message: 'must be 500 characters or fewer' },
    ]);
  }
}

{
  const result = validateBookmarkInput({
    url: 'https://user:pass@example.com/private',
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.deepEqual(result.errors, [{ field: 'url', message: 'must not include username or password' }]);
  }
}

{
  const longUrl = `https://example.com/${'a'.repeat(2050)}`;
  const result = validateBookmarkInput({
    url: 'https://example.com',
    thumbnailUrl: longUrl,
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.deepEqual(result.errors, [{ field: 'thumbnailUrl', message: 'must be 2048 characters or fewer' }]);
  }
}

{
  const result = validateBookmarkInput({
    url: 'https://example.com',
    title: '  hello title  ',
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.title, 'hello title');
  }
}

{
  const result = validateBookmarkInput({
    url: 'https://example.com',
    title: 'a'.repeat(301),
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.deepEqual(result.errors, [{ field: 'title', message: 'must be 300 characters or fewer' }]);
  }
}