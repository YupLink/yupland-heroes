// Память сборки (21.10.2026): ошибки поиска модулей держали целые сборки.
//
// exsolve (поиск модулей, им пользуется плагин TanStack Start — защита импортов)
// кладёт КАЖДЫЙ неудачный поиск в вечный глобальный кэш globalThis.__EXSOLVE_CACHE__
// объектом Error. Error хранит стек вызовов, а через него — PluginDriver
// Rollup и весь граф модулей той сборки (деревья разбора, переменные, куски).
// Так клиентская сборка оставляла после себя ~1,1 ГБ, серверная — ещё ~1,4,
// nitro — ещё ~1,4: к концу 4+ ГБ живой кучи и «heap out of memory» на
// сервере (снимок кучи: global → __EXSOLVE_CACHE__ → Error → CallSiteInfo →
// PluginDriver → Graph).
//
// После каждого окружения выкидываем из кэша только ошибки: удачные адреса
// остаются, повторный неудачный поиск просто пройдёт заново (дёшево).
type ResolveCache = Map<string, unknown>;

/** Убрать из кэша exsolve закэшированные ошибки; вернуть, сколько убрано. */
export function dropResolveErrors(cache: ResolveCache | undefined): number {
  if (!cache) return 0;
  let n = 0;
  for (const [key, value] of cache) {
    if (value instanceof Error) {
      cache.delete(key);
      n++;
    }
  }
  return n;
}

const exsolveCache = () => (globalThis as { __EXSOLVE_CACHE__?: ResolveCache }).__EXSOLVE_CACHE__;

/** Плагин Vite: только сборка; чистит кэш в конце каждого окружения. */
export function releaseResolveErrors() {
  return {
    name: "release-resolve-errors",
    apply: "build" as const,
    closeBundle() {
      dropResolveErrors(exsolveCache());
    },
  };
}
