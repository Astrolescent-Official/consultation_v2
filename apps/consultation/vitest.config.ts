import viteTsConfigPaths from 'vite-tsconfig-paths'
import { defineConfig } from 'vitest/config'

// Deliberately does not reuse vite.config.ts. The app's dev plugins (nitro,
// tanstackStart) hold open handles that keep the test process alive after the
// run finishes; unit tests only need the `@/*` path aliases.
export default defineConfig({
  plugins: [viteTsConfigPaths({ projects: ['./tsconfig.json'] })],
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx']
  }
})
