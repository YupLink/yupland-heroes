// Курс DARAI к $ для цен подписки: один запрос к Ref раз в 5 минут на процесс.
//
// Почему кэш, а не запрос на каждый заход во вкладку: запросов к Ref было бы
// столько, сколько заходов, и вкладка ждала бы сеть. С кэшем — 288 запросов в
// сутки при любом числе игроков, а игрок получает готовое число из памяти.
//
// Источник тот же, что у комиссии минта фишек (indexer.ref.finance) — спот-цена
// пула; 29.09 она сходилась с реальной покупкой/продажей на Ref в пределах 2 %.
// Ref недоступен — держим последний курс 30 минут, дальше DARAI-цены нет
// (оплата USDT и Stars работает без курса).
//
// 14.10.2026: игрок больше не ждёт Ref. Курс протух — отдаём прежний сразу, а
// новый тянем фоном (раньше лавка паков ждала ответа Ref до 8 с, днём он
// упирался в таймаут). Курс лежит и в базе (settings.darai_usd_rate): свежий
// рабочий после выкатки берёт его оттуда, а не идёт в Ref с пустыми руками.

const PRICE_API = "https://indexer.ref.finance/list-token-price";
const DARAI = "darai.tkn.near";
const FRESH_MS = 5 * 60_000;
const STALE_MS = 30 * 60_000;

type Cached = { daraiPerUsd: number; at: number };
let cache: Cached | null = null;
let inflight: Promise<Cached | null> | null = null;
let savedLoaded = false;
const SAVED_KEY = "darai_usd_rate";

async function loadSaved(): Promise<Cached | null> {
  try {
    const { mcpExec } = await import("../../db/mcpClient");
    const rows = (await mcpExec(
      `SELECT value FROM yuplink.settings WHERE key = '${SAVED_KEY}' LIMIT 1;`,
      { wrapJson: true },
    )) as Array<{ value: string }>;
    const v = JSON.parse(rows?.[0]?.value ?? "null") as Cached | null;
    return v && v.daraiPerUsd > 0 && Number.isFinite(v.at) ? v : null;
  } catch {
    return null;
  }
}

async function save(c: Cached): Promise<void> {
  try {
    const { mcpExec } = await import("../../db/mcpClient");
    const value = JSON.stringify(c).replace(/'/g, "''");
    await mcpExec(
      `INSERT INTO yuplink.settings (key, value) VALUES ('${SAVED_KEY}', '${value}')
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;`,
    );
  } catch {
    /* сохранить не вышло — курс есть в памяти */
  }
}

/** Один запрос к Ref на процесс; удачный курс — в память и в базу. */
function refresh(): Promise<Cached | null> {
  inflight ??= fetchRate()
    .then((fresh) => {
      if (fresh) {
        cache = fresh;
        void save(fresh);
      }
      return fresh;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

async function fetchRate(): Promise<Cached | null> {
  try {
    const res = await fetch(PRICE_API, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return null;
    const j = (await res.json()) as Record<string, { price?: string }>;
    const usd = Number(j[DARAI]?.price);
    if (!(usd > 0)) return null;
    return { daraiPerUsd: 1 / usd, at: Date.now() };
  } catch {
    return null;
  }
}

/** Курс «DARAI за 1 $» и возраст в мс. null — курса нет дольше 30 минут. */
export async function daraiPerUsd(): Promise<{ rate: number; ageMs: number } | null> {
  const now = Date.now();
  if (!cache && !savedLoaded) {
    savedLoaded = true;
    cache = await loadSaved();
  }
  if (!cache || now - cache.at > STALE_MS) {
    // Годного курса нет вовсе — тут ждать приходится (один запрос на процесс).
    await refresh();
  } else if (now - cache.at >= FRESH_MS) {
    // Протух, но годен: отдаём прежний сразу, свежий — фоном.
    void refresh();
  }
  if (!cache || Date.now() - cache.at > STALE_MS) return null;
  return { rate: cache.daraiPerUsd, ageMs: Math.max(0, Date.now() - cache.at) };
}

/** Для тестов: сбросить кэш. */
export function resetRateCache(): void {
  cache = null;
  inflight = null;
  savedLoaded = false;
}
