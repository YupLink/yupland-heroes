// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { nitro } from "nitro/vite";
import { config as loadDotenv } from "dotenv";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// .env + .env.local → define ТОЛЬКО в серверные окружения (ssr, nitro), в
// клиентский бандл ключи из .env не попадают никогда. В dev так доезжают
// серверные секреты (SENDLER_API_KEY и др., лежат в .env.local; .env.local
// поверх .env). В сборке на сервере рядом лежит .env с SESSION_SECRET — и это
// ЕДИНСТВЕННЫЙ путь, которым секрет попадает в серверный код (в env
// контейнера его нет): без него сессии не проверяются, всё → 401 (инцидент
// 19.09, откат за 4 минуты). Убирать только вместе с переносом SESSION_SECRET
// в yuplink.env. См. memory golden-drop-local-preview.
const __localEnv: Record<string, string> = {
  ...(loadDotenv({ path: ".env" }).parsed ?? {}),
  ...(loadDotenv({ path: ".env.local" }).parsed ?? {}),
};
const __envDefine: Record<string, string> = {};
for (const [k, v] of Object.entries(__localEnv)) {
  if (/^(VERCEL|TURBO|NX|VITE_)/.test(k)) continue;
  __envDefine[`process.env.${k}`] = JSON.stringify(v);
}

// Серверные модули базы в клиентскую сборку не попадают: в окружении client
// они подменяются заглушкой с теми же именами экспортов. Файлы с server-fn
// (boss.ts, heroes.ts, currency-ledger.ts) импортируют их сверху, и через них
// supabase-js с мостом к базе (~240 КБ) уезжали в телефон. Обращение к
// заглушке на клиенте — ошибка «server-only: …»: так и должно быть.
// Клиент ИИ (ai/mimo) — в том же списке: ключи провайдера читает он, и даже
// мёртвым кодом в телефоне ему делать нечего.
const SERVER_ONLY = /\/src\/server\/(db\/(pg|mcpClient|directPg|postgrestShim)|ai\/mimo|raidLive)\.ts$/;
function exportNames(src: string): string[] {
  const names = new Set<string>();
  const decl = /^export\s+(?:async\s+)?(?:const|let|var|function\*?|class)\s+([A-Za-z_$][\w$]*)/gm;
  for (const m of src.matchAll(decl)) names.add(m[1]);
  for (const m of src.matchAll(/^export\s*\{([^}]*)\}/gm)) {
    for (const part of m[1].split(",")) {
      const item = part.trim();
      if (!item || item.startsWith("type ")) continue;
      const name = item
        .split(/\s+as\s+/)
        .pop()
        ?.trim();
      if (name) names.add(name);
    }
  }
  return [...names];
}
const serverOnlyStubs = {
  name: "server-only-stubs",
  enforce: "pre" as const,
  load(this: { environment?: { name?: string } }, id: string) {
    if (this.environment?.name !== "client" || !SERVER_ONLY.test(id)) return null;
    const body = exportNames(readFileSync(id, "utf8"))
      .map((n) => `export const ${n} = __stub(${JSON.stringify(n)});`)
      .join("\n");
    return [
      "const __stub = (name) => new Proxy(function () {}, {",
      '  get: (_t, k) => (k === "then" ? undefined : __stub(name + "." + String(k))),',
      '  apply: () => { throw new Error("server-only: " + name); },',
      "});",
      body,
      'export default __stub("default");',
      "",
    ].join("\n");
  },
};

// BUILD_ID — на проде это git-SHA от Vercel, локально fallback на dev-таймстамп.
// Зашивается в клиентский bundle через define и в server-runtime через
// process.env. Клиент при загрузке/focus сравнивает свою версию с серверной
// (GET /api/version) и при расхождении показывает баннер «обнови страницу».
const BUILD_ID = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? `dev-${Date.now()}`;

// Nitro-пресет по окружению:
//  - на Vercel (process.env.VERCEL задан) → "vercel" — прод + фоллбэк-откат;
//  - на self-host (деплой-webhook, VERCEL не задан) → "node-server" →
//    автономный `node .output/server/index.mjs` за Caddy reverse-proxy.
// Можно форсить через NITRO_PRESET.
// Self-host → node-cluster: entry слушает порт с exclusive:false (SO_REUSEPORT),
// поэтому несколько процессов node делят один порт, а ОС балансирует между ними
// (compose запускает N процессов). Один процесс упирался в одно ядро из восьми;
// live-поток между воркерами связывает Postgres LISTEN/NOTIFY (raidLive).
// Self-host собирается пресетом node-cluster ради worker.mjs, но запускает
// его НЕ штатный index.mjs, а scripts/cluster-master.mjs: один рабочий,
// запасные поднимаются только под перегрузку (см. compose на сервере).
const NITRO_PRESET = process.env.NITRO_PRESET ?? (process.env.VERCEL ? "vercel" : "node-cluster");

const BASE_PATH = process.env.BASE || "/";

export default defineConfig({
  cloudflare: false,
  plugins: [
    nitro({
      config: {
        preset: NITRO_PRESET,
        publicAssets: [{ dir: ".output/public", baseURL: BASE_PATH }],
        // Старт сторожа и отчёта о задержке цикла при загрузке процесса.
        plugins: [fileURLToPath(new URL("./src/server/nitro/boot.ts", import.meta.url))],
      },
    }),
  ],
  vite: {
    base: BASE_PATH,
    define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
    // Окружения сборки: client / ssr / nitro. Секреты — только серверным.
    environments: {
      ssr: { define: __envDefine },
      nitro: { define: __envDefine },
    },
    server: { hmr: { overlay: false } },
    plugins: [serverOnlyStubs],
  },
});
