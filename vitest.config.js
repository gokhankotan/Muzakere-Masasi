import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./server/tests/setup.js'],
    pool: 'forks',
    fileParallelism: false
  }
});
