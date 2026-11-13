// Курс DARAI к $ для цен подписки: один запрос к Ref раз в 5 минут на процесс.
//
// Почему кэш, а не запрос на каждый заход во вкладку: запросов к Ref было бы
// столько, сколько заходов, и вкладка ждала бы сеть. С кэшем — 288 запросов в
// сутки при любом числе игроков, а игрок получает готовое число из памяти.
//
// Источник — Ref Finance (с 04.11 — живой обмен, см. ниже).
// Ref недоступен — держим последний курс 30 минут, дальше DARAI-цены нет
// (оплата USDT и Stars работает без курса).
//
// 14.10.2026: игрок больше не ждёт Ref. Курс протух — отдаём прежний сразу, а
// новый тянем фоном (раньше лавка паков ждала ответа Ref до 8 с, днём он
// упирался в таймаут). Курс лежит и в базе (settings.darai_usd_rate): свежий
// рабочий после выкатки берёт его оттуда, а не идёт в Ref с пустыми руками.
//
// 25.10.2026: общий прайс-лист Ref (list-token-price) разросся до 614 КБ и
// качается 12–13 с — за 8 с таймаута не успевал, курс протух, DARAI-цены
// пропали из подписок, лавки золота и наборов. Берём цену одного токена
// (get-token-price, 70 байт, ~1 с); не ответил индексер — второй адрес Ref.
//
// 04.11.2026: индексер Ref застыл — с 29.10 отдавал одну и ту же цену DARAI
// (1 708 420 за $ против живых ~2,02 млн; NEAR у него $1,33 при $4,01), и
// подписки, золото, наборы за DARAI шли на ~15 % дешевле цены в $. Теперь курс
// — живой обмен: сколько DARAI Ref даёт за 1 USDT прямо сейчас (смарт-роутер
// считает по пулам на момент запроса). Не ответил — цена одного токена с
// api.ref.finance; застывший индексер не спрашиваем.

const ROUTER_URL =
  "https://smartrouter.ref.finance/findPath?amountIn=1000000" +
  "&tokenIn=usdt.tether-token.near&tokenOut=darai.tkn.near&pathDeep=3&slippage=0.005";
const PRICE_URL = "https://api.ref.finance/get-token-price?token_id=darai.tkn.near";
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

type RouterResp = { amount_out?: string; result_data?: { amount_out?: string } };

/** $ за 1 DARAI по живому обмену 1 USDT → DARAI. */
export async function routerUsd(): Promise<number | null> {
  const res = await fetch(ROUTER_URL, { signal: AbortSignal.timeout(8_000) });
  if (!res.ok) return null;
  const j = (await res.json()) as RouterResp;
  const out = Number((j.result_data ?? j).amount_out) / 1e18;
  return out > 0 ? 1 / out : null;
}

/** $ за 1 DARAI по цене токена Ref. */
export async function feedUsd(): Promise<number | null> {
  const res = await fetch(PRICE_URL, { signal: AbortSignal.timeout(8_000) });
  if (!res.ok) return null;
  const usd = Number(((await res.json()) as { price?: string })?.price);
  return usd > 0 ? usd : null;
}

/** Цена 1 DARAI в $ по живому обмену на Ref; null — оба адреса не ответили. */
export async function fetchDaraiUsd(): Promise<number | null> {
  for (const get of [routerUsd, feedUsd]) {
    try {
      const usd = await get();
      if (usd) return usd;
    } catch {
      /* следующий адрес */
    }
  }
  return null;
}

async function fetchRate(): Promise<Cached | null> {
  const usd = await fetchDaraiUsd();
  return usd ? { daraiPerUsd: 1 / usd, at: Date.now() } : null;
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
