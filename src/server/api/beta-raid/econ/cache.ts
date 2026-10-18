// Общий кэш отчётов «$ Экономика»: 30 секунд на ключ, как у сводки
// (admin-economy.ts). Панель дёргают часто, а отчёты ходят по миллионам
// строк currency_ledger — второй раз за полминуты базу не спрашиваем.
// Ключ — имя отчёта + нормализованный вход; окно уже зажато normalizeRange,
// так что «to = сейчас» не плодит ключи каждую секунду… кроме случая, когда
// клиент шлёт свежий toISOString — тогда кэш не спасает, и это его право.
const CACHE_MS = 30_000;
const store = new Map<string, { at: number; value: unknown }>();

/** Вернуть свежее значение по ключу или посчитать и запомнить. */
export async function memo<T>(key: string, load: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && now - hit.at < CACHE_MS) return hit.value as T;
  const value = await load();
  store.set(key, { at: now, value });
  // Ключей немного (вход — окно + фильтры), но за долгую жизнь процесса
  // старые окна копятся; выкидываем протухшие при каждой записи.
  for (const [k, v] of store) if (now - v.at >= CACHE_MS) store.delete(k);
  return value;
}

/** Ключ кэша: имя отчёта + вход в каноническом JSON. */
export const cacheKey = (report: string, input: unknown): string =>
  `${report}:${JSON.stringify(input)}`;
