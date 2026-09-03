import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/types.ts'],
      thresholds: { branches: 92, functions: 100, lines: 99, statements: 99 },
    },
  },
});
