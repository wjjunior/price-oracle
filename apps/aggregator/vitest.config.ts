import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      all: true,
      include: ['src/domain/**'],
      exclude: ['**/*.test.ts', '**/__test-helpers__/**'],
      reporter: ['text'],
    },
  },
});
