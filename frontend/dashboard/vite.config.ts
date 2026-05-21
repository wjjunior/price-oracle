import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const proxied = { target: 'http://localhost:4000', changeOrigin: true };

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { tsconfigPaths: true },
  server: {
    proxy: {
      '/api': proxied,
      '/events': { ...proxied, ws: false },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
});
