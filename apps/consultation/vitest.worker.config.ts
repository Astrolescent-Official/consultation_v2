import {
  defineWorkersConfig,
  readD1Migrations
} from '@cloudflare/vitest-pool-workers/config'

const migrations = await readD1Migrations('../../packages/database/d1')

export default defineWorkersConfig({
  test: {
    include: ['src/**/*.worker.test.ts'],
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.jsonc' },
        miniflare: {
          bindings: { TEST_MIGRATIONS: migrations }
        }
      }
    }
  }
})
