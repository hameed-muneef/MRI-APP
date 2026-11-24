import {defineConfig} from 'vitest/config';

// Unit tests live in src/** and run under Vitest.
// tests/*.test.mjs are node:test suites run by `npm test` (node --test);
// keep them out of Vitest's default glob so both runners stay green.
export default defineConfig({
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
