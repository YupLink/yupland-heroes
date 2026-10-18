// Build ID — git-SHA текущего деплоя.
// Зашивается в клиент через `define: { __BUILD_ID__ }` в vite.config.ts.
// Сервер читает то же значение через process.env.VERCEL_GIT_COMMIT_SHA.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const __BUILD_ID__: string;

export const BUILD_ID: string =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  typeof __BUILD_ID__ !== "undefined" ? __BUILD_ID__ : "dev-unknown";

// Серверная версия (используется в /api/version и при сравнении через header).
//
// Возвращаем ЗАШИТЫЙ при сборке BUILD_ID: он всегда равен текущему билду и
// совпадает с клиентским __BUILD_ID__. Раньше читали process.env.GITHUB_SHA
// из рантайма, но в self-host контейнере он пустой/замороженный — и
// /api/version отдавал устаревший SHA, из-за чего баннер «обновитесь» висел
// вечно и не лечился перезагрузкой (инцидент 25.08). Env оставлен фолбэком
// только для локалки, где __BUILD_ID__ не зашит (dev-unknown).
export function serverBuildId(): string {
  if (BUILD_ID && BUILD_ID !== "dev-unknown") return BUILD_ID;
  if (typeof process === "undefined") return BUILD_ID;
  return process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? BUILD_ID;
}
