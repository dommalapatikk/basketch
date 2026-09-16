import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      // 'server-only' is not a real npm package — its `exports` map only
      // resolves to a file under the `react-server` condition, which is a
      // Next.js build-time alias vitest's plain Node resolution never sets.
      // Aliasing straight to Next's own compiled file for that condition
      // (verified present, and genuinely empty — `import 'server-only'` is a
      // side-effect-only import) means server-data modules that correctly
      // guard themselves with it can be imported from a test at all, without
      // maintaining a second, hand-written stand-in for a file Next already
      // ships.
      'server-only': resolve(__dirname, 'node_modules/next/dist/compiled/server-only/empty.js'),
    },
  },
  test: {
    // Default stays `node` — the domain, filter and provider suites have no DOM
    // and should stay fast. Component suites opt in per file with a
    // `// @vitest-environment jsdom` docblock.
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['node_modules', '.next', '.ladle'],
  },
})
