// Тест-раннер проекта: `bun run test`.
//
// Свой конфиг, а НЕ vite.config.ts, намеренно: боевой конфиг тянет nitro,
// пресеты деплоя и подмешивает в сборку весь .env — тесту это не нужно, а
// секреты в процессе с тестами не нужны тем более. Vitest берёт vitest.config
// в приоритете, поэтому боевой конфиг здесь просто не участвует.
//
// Алиас `@` прописан руками (одна строка вместо плагина tsconfig-paths): путей
// в проекте ровно один, и лишний плагин в тестах — лишняя точка отказа.
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    // Окружение node: браузерных тестов в проекте нет, а jsdom тянул бы за
    // собой ещё одну зависимость ради ничего.
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // Заглушка сети и чистка адресов базы — см. комментарий в setup.
    setupFiles: ["./src/test/setup.ts"],
  },
});
