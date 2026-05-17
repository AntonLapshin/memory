import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/__tests__/**/*.test.ts'],
    environment: 'node',
    globals: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/cli.ts', 'src/types.ts'],
      reporter: ['text', 'lcov'],
    },
    testTimeout: 15_000,
    hookTimeout: 10_000,
    setupFiles: ['src/__tests__/setup.ts'],
  },
});
