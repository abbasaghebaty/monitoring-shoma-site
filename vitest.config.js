import { readFileSync } from "node:fs";
import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./worker/wrangler.toml" },
      miniflare: {
        bindings: {
          TEST_BASELINE_SQL: read("./worker/migrations/0000_baseline.sql"),
          TEST_AUDIT_MIGRATION_SQL: read("./worker/migrations/0001_product_audit_log.sql"),
          TEST_INVENTORY_MIGRATION_SQL: read("./worker/migrations/0002_inventory_master_data.sql"),
        },
      },
    }),
  ],
  test: {
    include: ["tests/d1-runtime.test.js"],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
