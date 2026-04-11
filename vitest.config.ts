import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["tests/**/*.test.ts"],
    setupFiles: ["./tests/setup.ts"],
    // Each test file runs in isolation so mutable MOCK_* arrays don't bleed
    // across files. Within a file we reset manually in `beforeEach`.
    isolate: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // `server-only` is a marker package used by Next.js to prevent client
      // imports of server code. It throws at import time in a browser
      // context; in Vitest we just stub it out to an empty module.
      "server-only": path.resolve(__dirname, "./tests/stubs/server-only.ts"),
      // `next/headers` is not available outside a Next.js server context —
      // stub cookies() with an in-memory implementation so data-layer
      // functions that call it don't blow up.
      "next/headers": path.resolve(__dirname, "./tests/stubs/next-headers.ts"),
      "next/cache": path.resolve(__dirname, "./tests/stubs/next-cache.ts"),
    },
  },
});
