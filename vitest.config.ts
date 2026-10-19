import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        'dist/**',
        'tests/**',
        'prisma/**',
        'prisma.config.ts',
        'vitest.config.ts',
        'scripts/**',
        'src/server.ts',
        'src/shared/types/**',
      ],
      thresholds: {
        lines: 75,
        functions: 70,
        branches: 65,
        statements: 75,
      },
    },
    testTimeout: 20000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
