import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    // T.3J: the private bank's own tests run with it when it is checked out (docs/exam-system/34).
    include: ['tests/**/*.test.{ts,tsx}', 'private/question-bank/tests/**/*.test.{ts,tsx}'],
    setupFiles: ['./tests/setup.ts'],
    // Half the cores (T.1.1): the default (cores − 1) oversubscribes the CPU-bound files (highlight, curriculum) on a
    // busy machine, and the run is no faster. Same files and tests; only how many run at once.
    maxWorkers: '50%',
  },
});
