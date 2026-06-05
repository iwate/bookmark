import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: '.',
  server: {
    fs: {
      allow: ['.', '/workspaces'],
    },
  },
  test: {
    environment: 'node',
    include: ['src/vitest.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      all: true,
      include: ['src/**/*.{ts,js}'],
      exclude: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
  },
});