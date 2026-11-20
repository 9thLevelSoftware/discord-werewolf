import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      'cloudflare:workers': decodeURIComponent(
        new URL('./src/__tests__/shims/cloudflareWorkers.ts', import.meta.url).pathname.replace(
          /^\/([A-Za-z]:\/)/,
          '$1',
        ),
      ),
    },
  },
  test: {
    environment: 'node',
    include: ['src/__tests__/**/*.test.ts'],
  },
});
