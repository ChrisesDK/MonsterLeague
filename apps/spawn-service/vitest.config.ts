import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.toml' },
        miniflare: { bindings: { SPAWN_SECRET: 'test-secret-not-for-production' } },
      },
    },
  },
});
