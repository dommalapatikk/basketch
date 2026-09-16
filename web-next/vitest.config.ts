import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      // 'server-only' is a Next.js build-time alias, not a real package — see
      // src/test/server-only-stub.ts for why this is needed to import any
      // server-data module from a test.
      'server-only': resolve(__dirname, 'src/test/server-only-stub.ts'),
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
