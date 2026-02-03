import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/types/**', 'src/**/*.d.ts'],
    },
    testTimeout: 10000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@core': path.resolve(__dirname, './src/core'),
      '@config': path.resolve(__dirname, './src/config'),
      '@database': path.resolve(__dirname, './src/database'),
      '@providers': path.resolve(__dirname, './src/providers'),
      '@services': path.resolve(__dirname, './src/services'),
      '@monitors': path.resolve(__dirname, './src/monitors'),
      '@api': path.resolve(__dirname, './src/api'),
      '@types': path.resolve(__dirname, './src/types'),
    },
  },
});
