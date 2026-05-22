import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

declare const process: { readonly env: Record<string, string | undefined> };

const DEFAULT_AGGREGATOR_PORT = '7402';
const DEFAULT_MOCK_PORT = '7401';
const aggregatorPort = process.env.AGGREGATOR_HTTP_PORT ?? DEFAULT_AGGREGATOR_PORT;
const mockPort = process.env.MOCK_HTTP_PORT ?? DEFAULT_MOCK_PORT;
const aggregatorProxy = { target: `http://localhost:${aggregatorPort}`, changeOrigin: true };
const mockProxy = { target: `http://localhost:${mockPort}`, changeOrigin: true };

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { tsconfigPaths: true },
  server: {
    proxy: {
      '/api': aggregatorProxy,
      '/admin': mockProxy,
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
});
