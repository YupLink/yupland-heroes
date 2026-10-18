// Проверки на тестовых данных в БОЕВОЙ базе (казино, ломбард): только руками,
// `E2E_PROD=1 npx vitest run --config vitest.e2e.config.ts`. Ходят в базу по SSH
// под тестовыми аккаунтами zz_e2e_* и за собой всё убирают (src/test/e2e).
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["src/test/e2e/**/*.e2e.ts"],
    testTimeout: 30 * 60_000,
    hookTimeout: 5 * 60_000,
    fileParallelism: false,
  },
});
