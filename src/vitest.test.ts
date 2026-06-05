import { test } from 'vitest';

test('legacy assertion suites', async () => {
  await import('./utils/validation.test.ts');
  await import('./lib/metadata.test.ts');
  await import('./lib/bookmark-store.test.ts');
  await import('./lib/render.test.ts');
  await import('./worker.test.ts');
});