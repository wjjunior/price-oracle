import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['integration/**/*.test.ts'],
    globalSetup: ['./global-setup.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
