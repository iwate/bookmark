const testFiles = [
  '../src/utils/validation.test.ts',
  '../src/lib/bookmark-store.test.ts',
  '../src/lib/render.test.ts',
  '../src/worker.test.ts',
];

for (const testFile of testFiles) {
  console.log(`running ${testFile}`);
  await import(new URL(testFile, import.meta.url));
}

console.log('all tests passed');