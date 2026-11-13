// Sendler API helper. Использует SENDLER_API_KEY из env (только сервер).
//
// Защита от rate-limit'ов:
//   1. In-flight dedup — параллельные запросы за тем же ключом получают
//      ОДИН и тот же promise (а не каждый свой HTTP).
//   2. TTL-кэш successful-ответов — за окно TTL новые вызовы достают из
//      памяти без HTTP.
//   3. Concurrency limit — не больше N одновременных запросов к Sendler.
//      Остальные ждут в очереди.
//   4. Retry с exponential backoff + jitter на 429/5xx.
//
// Всё это локально в инстансе функции; для Vercel'овских serverless'ок
// каждый instance держит свой кэш. Это OK — даже cold-start с пустым
// кэшем сразу выигрывает на dedup'е параллельных запросов в одном instance.

const SENDLER_API_BASE = "https://api.sendler.xyz/nft/";
// Экспортируется: постраничные обходы истории живут в своих модулях
// (сверка пула карты), а адрес индексера должен быть один на всех.
export const SENDLER_API_ROOT = "https://api.sendler.xyz";

/**
 * История FT-переводов аккаунта через индексер Sendler. Один HTTP-запрос
 * заменяет N RPC tx-status вызовов — спасает от rate-limit'ов FastNear
 * при массовых выводах. Используется в resolveStuckProcessing.
 *
 * Schema ответа в OpenAPI не задокументирован — парсим гибко: ищем
 * tx_hash в полях `transaction_hash` / `tx_hash` / `hash`.
 */
export interface SendlerFtTransfer {
  txHash: string;
  amount?: string;
  symbol?: string;
  receiver?: string;
  sender?: string;
  blockTimestampNs?: string;
  raw: Record<string, unknown>;
}

const ftHistoryCache = new Map<string, CacheEntry<SendlerFtTransfer[]>>();
const ftHistoryInflight = new Map<string, Promise<SendlerFtTransfer[]>>();
const FT_HISTORY_TTL_MS = 8_000; // короткий TTL: resolver хочет свежее, но за окно >1с — дедуп

/**
 * Найти конкретный ft-transfer по tx_hash через индексер Sendler.
 * Используется в verifyFtTransfer (покупка билетов, fee).
 *
 * Возвращает первый match или null. Парсит amount/receiver/sender/symbol.
 * Если txHash найден И receiver+amount совпадают с ожидаемыми — verify OK.
 */
/**
 * Найти перевод по хэшу среди ВХОДЯЩИХ на наш кошелёк.
 *
 * Так лучше, чем искать по отправителю: получатель у нас один и известен, а
 * отправителей приходится перебирать по всем sister-кошелькам — это N
 * запросов вместо одного, и промах, если человек подписал кошельком, которого
 * в списке нет.
 *
 * Фильтр по символу и курсор — из схемы Sendler (проверено на живом ключе:
 * перевод двухдневной давности находится на первой странице с фильтром и на
 * второй без него).
 *
 * Бросает, если индексер недоступен: «не нашли» и «не смогли посмотреть» —
 * разные вещи, и вторая не должна выглядеть как «перевода не было».
 */
export async function findFtTransferToReceiver(opts: {
  txHash: string;
  receiver: string;
  symbol?: string;
  /** Сколько страниц по 200 пролистать. Дальше — уже история, не свежий перевод. */
  maxPages?: number;
}): Promise<SendlerFtTransfer | null> {
  const apiKey = process.env.SENDLER_API_KEY;
  if (!apiKey) throw new Error("SENDLER_API_KEY не сконфигурирован");
  const maxPages = Math.max(1, opts.maxPages ?? 5);
  let cursor: string | null = null;

  for (let page = 0; page < maxPages; page++) {
    const url = new URL(`${SENDLER_API_ROOT}/history/ft-transfers/`);
    url.searchParams.set("wallet_id", opts.receiver);
    url.searchParams.set("direction", "in");
    if (opts.symbol) url.searchParams.set("symbol", opts.symbol);
    url.searchParams.set("limit", "200");
    if (cursor) url.searchParams.set("cursor", cursor);

    const res = await fetchWithRetry(url.toString(), {
      headers: { accept: "application/json", "X-API-Key": apiKey },
    });
    if (!res.ok) {
      throw new Error(`Sendler /history/ft-transfers: ${res.status} ${res.statusText}`);
    }
    const json = (await res.json()) as {
      items?: unknown[];
      next_cursor?: string | null;
      detail?: string;
    };
    if (json?.detail) throw new Error(`Sendler: ${json.detail}`);
    const items = Array.isArray(json.items) ? json.items : [];
    for (const it of items) {
      const r = (it ?? {}) as Record<string, unknown>;
      if (String(r.tx_hash ?? "") !== opts.txHash) continue;
      return {
        txHash: String(r.tx_hash ?? ""),
        amount: r.amount == null ? undefined : String(r.amount),
        symbol: r.symbol == null ? undefined : String(r.symbol),
        receiver: r.receiver_id == null ? undefined : String(r.receiver_id),
        sender: r.sender_id == null ? undefined : String(r.sender_id),
        blockTimestampNs:
          r.block_timestamp == null ? undefined : String(r.block_timestamp),
        raw: r,
      };
    }
    cursor = (json.next_cursor as string | null) ?? null;
    if (!cursor || items.length === 0) break;
  }
  return null;
}

export async function findFtTransferByTxHash(opts: {
  txHash: string;
  senderAccount: string;
}): Promise<SendlerFtTransfer | null> {
  // Sendler не имеет прямого /tx/{hash}, но через /history/ft-transfers/
  // фильтруем по wallet=sender direction=out. limit=200 — за окно последних
  // ~часа любого активного аккаунта мы точно поймаем свежую TX.
  const items = await fetchAdminFtTransferHistory({
    walletId: opts.senderAccount,
    direction: "out",
    limit: 200,
  });
  return items.find((i) => i.txHash === opts.txHash) ?? null;
}

/**
 * Один элемент NFT-истории из /history/nft-user-history.
 * Это и есть наш способ проверять nft_transfer без NEAR RPC:
 * ищем по tx_hash в свежих in/out этого кошелька и сверяем
 * receiver/sender/token.
 */
export interface SendlerNftHistoryItem {
  tx_hash?: string;
  block_timestamp?: string;
  block_height?: number;
  receipt_id?: string;
  action_type?: string;
  method?: string;
  contract_id?: string;
  token_id?: string;
  title?: string;
  sender_id?: string;
  receiver_id?: string;
  called_by?: string;
  memo?: string;
}

export async function fetchSendlerNftUserHistory(opts: {
  walletId: string;
  type?: "transfer" | "mint" | "sale" | "burn" | "listing";
  direction?: "in" | "out" | "all";
  nftContractId?: string;
  limit?: number;
  /**
   * Сколько страниц по 200 пролистать курсором. Без листания видно только
   * последние 200 событий кошелька, и всё, что старше, для нас «не было» —
   * ровно так терялись переводы NFT у активных игроков.
   */
  maxPages?: number;
}): Promise<SendlerNftHistoryItem[]> {
  const apiKey = process.env.SENDLER_API_KEY;
  if (!apiKey) throw new Error("SENDLER_API_KEY не сконфигурирован");
  const perPage = Math.min(opts.limit ?? 100, 200);
  const maxPages = Math.max(1, opts.maxPages ?? 1);
  const out: SendlerNftHistoryItem[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < maxPages; page++) {
    const url = new URL(`${SENDLER_API_ROOT}/history/nft-user-history/`);
    url.searchParams.set("wallet_id", opts.walletId);
    if (opts.type) url.searchParams.set("type", opts.type);
    if (opts.direction) url.searchParams.set("direction", opts.direction);
    if (opts.nftContractId) url.searchParams.set("nft_contract_id", opts.nftContractId);
    url.searchParams.set("limit", String(perPage));
    if (cursor) url.searchParams.set("cursor", cursor);

    const res = await fetchWithRetry(url.toString(), {
      headers: { accept: "application/json", "X-API-Key": apiKey },
    });
    if (!res.ok) {
      throw new Error(
        `Sendler /history/nft-user-history: ${res.status} ${res.statusText}`
      );
    }
    const j = (await res.json()) as {
      items?: SendlerNftHistoryItem[];
      next_cursor?: string | null;
      detail?: string;
    };
    if (j?.detail) throw new Error(`Sendler: ${j.detail}`);
    const items = j.items ?? [];
    out.push(...items);
    cursor = j.next_cursor ?? null;
    if (!cursor || items.length === 0) break;
  }
  return out;
}

export async function fetchAdminFtTransferHistory(opts: {
  walletId: string;
  direction?: "all" | "in" | "out";
  symbol?: string;
  limit?: number;
}): Promise<SendlerFtTransfer[]> {
  const apiKey = process.env.SENDLER_API_KEY;
  if (!apiKey) throw new Error("SENDLER_API_KEY не сконфигурирован");

  const direction = opts.direction ?? "out";
  const limit = Math.min(opts.limit ?? 200, 200);
  const key = `ft::${opts.walletId}::${direction}::${opts.symbol ?? ""}::${limit}`;

  const cached = cacheGet(ftHistoryCache, key);
  if (cached) return cached;
  const inflight = ftHistoryInflight.get(key);
  if (inflight) return inflight;

  const p = (async () => {
    try {
      const url = new URL(`${SENDLER_API_ROOT}/history/ft-transfers/`);
      url.searchParams.set("wallet_id", opts.walletId);
      url.searchParams.set("direction", direction);
      if (opts.symbol) url.searchParams.set("symbol", opts.symbol);
      url.searchParams.set("limit", String(limit));

      const res = await fetchWithRetry(url.toString(), {
        headers: { accept: "application/json", "X-API-Key": apiKey },
      });
      if (!res.ok) {
        throw new Error(
          `Sendler /history/ft-transfers: ${res.status} ${res.statusText}`
        );
      }
      const json = (await res.json()) as unknown;
      // Ответ может быть {items: [...]} или просто [...].
      const items: unknown[] = Array.isArray(json)
        ? json
        : Array.isArray((json as { items?: unknown[] }).items)
          ? (json as { items: unknown[] }).items
          : Array.isArray((json as { data?: unknown[] }).data)
            ? (json as { data: unknown[] }).data
            : [];

      const out: SendlerFtTransfer[] = [];
      for (const it of items) {
        if (!it || typeof it !== "object") continue;
        const r = it as Record<string, unknown>;
        const txHash =
          (r.transaction_hash as string | undefined) ??
          (r.tx_hash as string | undefined) ??
          (r.hash as string | undefined) ??
          "";
        if (!txHash) continue;
        out.push({
          txHash,
          amount: r.amount as string | undefined,
          symbol:
            (r.symbol as string | undefined) ??
            (r.token_symbol as string | undefined),
          receiver:
            (r.receiver_id as string | undefined) ??
            (r.receiver as string | undefined) ??
            (r.to as string | undefined),
          sender:
            (r.sender_id as string | undefined) ??
            (r.sender as string | undefined) ??
            (r.from as string | undefined),
          blockTimestampNs:
            (r.block_timestamp as string | undefined) ??
            (r.timestamp_nanosec as string | undefined) ??
            (r.timestamp as string | undefined),
          raw: r,
        });
      }
      cacheSet(ftHistoryCache, key, out, FT_HISTORY_TTL_MS);
      return out;
    } finally {
      ftHistoryInflight.delete(key);
    }
  })();
  ftHistoryInflight.set(key, p);
  return p;
}

export interface SendlerNft {
  token_id: string;
  description?: string;
  media?: string;
  owner_id?: string;
  /** Когда токен последний раз сменил владельца (UTC без зоны) — «у игрока с». */
  last_updated_at?: string;
  reputation?: number;
  title?: string;
  nft_contract_id?: string;
}

// ──────── retry с backoff ────────
// Concurrency-limit отключён — тестируем без него. dedup'а + кэша должно
// хватать. Если упрёмся в 429 — вернём лимитер обратно.
// ── Ограничитель одновременных запросов ─────────────────────────────────
//
// Его отключали «на попробовать», и попробовали: Sendler режет ключ при
// частом обращении и отвечает «неверный ключ» — при верном ключе. На этом
// 30.08 не зачлось пополнение, а поиск перевода заваливал сам себя.
// Очередь дешевле отказа: лучше подождать, чем получить ложное «не найдено».
const MAX_INFLIGHT = 4;
let inflight = 0;
const waiting: Array<() => void> = [];

async function acquireSlot(): Promise<void> {
  if (inflight < MAX_INFLIGHT) {
    inflight++;
    return;
  }
  // Слот НАСЛЕДУЕТСЯ от освободившего, счётчик здесь не трогаем. Прежде было
  // наоборот: освободитель уменьшал счётчик, разбуженный увеличивал — и между
  // этими двумя моментами слот успевал занять третий. Лимит переставал быть
  // лимитом ровно тогда, когда он нужнее всего: под нагрузкой.
  await new Promise<void>((resolve) => waiting.push(resolve));
}

function releaseSlot(): void {
  const next = waiting.shift();
  if (next) {
    next(); // слот передан по наследству
    return;
  }
  inflight--;
}

export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  maxAttempts = 4
): Promise<Response> {
  await acquireSlot();
  try {
    return await fetchWithRetryInner(url, init, maxAttempts);
  } finally {
    releaseSlot();
  }
}

async function fetchWithRetryInner(
  url: string,
  init: RequestInit,
  maxAttempts: number
): Promise<Response> {
  // Per-attempt timeout. Без него undici-fetch ждёт TCP-таймаут (>1 минуты)
  // если Sendler виснет — 4 ретрая × вечность = функция Vercel умирает
  // по своему лимиту, юзер видит пустоту. С 6с-кэпом мы фейлимся быстро
  // и handler возвращает event-cards без NFT-ownership (fallback на пустоту).
  const PER_ATTEMPT_TIMEOUT_MS = 6_000;
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), PER_ATTEMPT_TIMEOUT_MS);
    try {
      const res = await fetch(url, { ...init, signal: ctrl.signal });
      clearTimeout(t);
      // Лимит частоты Sendler отдаёт НЕ как 429, а как «неверный ключ» —
      // проверено на живом ключе: гонка страниц подряд, и вместо данных
      // {"detail":"Invalid or missing API key"} при верном ключе. Считать это
      // ошибкой конфигурации нельзя: проверка перевода решит, что перевода
      // не было, и деньги игрока повиснут.
      if (res.status === 401 || res.status === 403) {
        const peek = await res
          .clone()
          .text()
          .catch(() => "");
        if (/invalid or missing api key/i.test(peek) && attempt < maxAttempts - 1) {
          await new Promise((r) => setTimeout(r, 700 * Math.pow(2, attempt)));
          continue;
        }
      }
      // 429 / 5xx → retry
      if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
        if (attempt < maxAttempts - 1) {
          const base = 200 * Math.pow(2, attempt); // 200, 400, 800
          const jitter = Math.floor(Math.random() * 150);
          await new Promise((r) => setTimeout(r, base + jitter));
          continue;
        }
      }
      return res;
    } catch (e) {
      clearTimeout(t);
      lastErr = e;
      if (attempt < maxAttempts - 1) {
        const base = 200 * Math.pow(2, attempt);
        const jitter = Math.floor(Math.random() * 150);
        await new Promise((r) => setTimeout(r, base + jitter));
        continue;
      }
    }
  }
  throw lastErr ?? new Error("Sendler API: max retries exceeded");
}

// ──────── TTL cache + in-flight dedup ────────
type CacheEntry<T> = { value: T; expiresAt: number };
const titleCache = new Map<string, CacheEntry<SendlerNft[]>>();
const titleInflight = new Map<string, Promise<SendlerNft[]>>();
const TITLE_TTL_MS = 30_000; // 30 секунд

const idCache = new Map<string, CacheEntry<SendlerNft | null>>();
const idInflight = new Map<string, Promise<SendlerNft | null>>();
const ID_TTL_MS = 60_000; // 1 минута — by-id меняется реже

function cacheGet<T>(map: Map<string, CacheEntry<T>>, k: string): T | null {
  const e = map.get(k);
  if (!e) return null;
  if (e.expiresAt <= Date.now()) {
    map.delete(k);
    return null;
  }
  return e.value;
}
function cacheSet<T>(
  map: Map<string, CacheEntry<T>>,
  k: string,
  v: T,
  ttlMs: number
) {
  map.set(k, { value: v, expiresAt: Date.now() + ttlMs });
  // Грубая сборка мусора — раз в ~200 записей чистим expired'ы.
  if (map.size > 200) {
    const now = Date.now();
    for (const [key, ent] of map) {
      if (ent.expiresAt <= now) map.delete(key);
    }
  }
}

export async function fetchSendlerNftsByTitle(
  contractAddress: string,
  title: string
): Promise<SendlerNft[]> {
  const apiKey = process.env.SENDLER_API_KEY;
  if (!apiKey) throw new Error("SENDLER_API_KEY не сконфигурирован");

  const cacheKey = `t::${contractAddress}::${title}`;
  const cached = cacheGet(titleCache, cacheKey);
  if (cached) return cached;

  const inflightP = titleInflight.get(cacheKey);
  if (inflightP) return inflightP;

  // Популярные титлы могут содержать >5000 экземпляров. Sendler-овский
  // максимум limit=5000 на запрос → паджинируем до тех пор, пока не
  // соберём всё (по total из ответа) или пока страница не вернёт меньше
  // лимита.
  const LIMIT = 5000;
  const MAX_PAGES = 20; // safety cap = 100k

  /** Один проход пагинации Sendler'а с конкретной строкой title. */
  async function fetchAllPages(t: string): Promise<{
    items: SendlerNft[];
    total: number;
    complete: boolean;
  }> {
    const all: SendlerNft[] = [];
    const seen = new Set<string>();
    let total = 0;
    let complete = false;
    for (let page = 0; page < MAX_PAGES; page++) {
      const url = new URL(SENDLER_API_BASE);
      url.searchParams.set("contract_address", contractAddress);
      url.searchParams.set("title", t);
      url.searchParams.set("skip", String(page * LIMIT));
      url.searchParams.set("limit", String(LIMIT));
      const res = await fetchWithRetry(url.toString(), {
        headers: { accept: "application/json", "X-API-Key": apiKey! },
      });
      if (!res.ok) {
        throw new Error(`Sendler API: ${res.status} ${res.statusText}`);
      }
      const json = (await res.json()) as {
        items?: SendlerNft[];
        total?: number;
      };
      const items = (json.items ?? []).filter((x) => !!x.token_id);
      if (page === 0 && typeof json.total === "number") total = json.total;
      let newOnPage = 0;
      for (const it of items) {
        if (seen.has(it.token_id)) continue;
        seen.add(it.token_id);
        all.push(it);
        newOnPage++;
      }
      if (newOnPage === 0 || items.length < LIMIT) {
        complete = true;
        break;
      }
      if (total > 0 && all.length >= total) {
        complete = true;
        break;
      }
    }
    return { items: all, total, complete };
  }

  const p = (async () => {
    try {
      // Mintbase-quirk: часть метадат хранится с trailing/leading пробелом
      // (например «Evil Glarungs Potion (mystic) »). Sendler'овский
      // ?title= — строгое совпадение, не нормализует. Если первый проход
      // вернул 0 — пробуем вариант с trailing-space (или, наоборот, без),
      // чтобы найти такие «битые» title.
      let { items, total, complete } = await fetchAllPages(title);
      if (items.length === 0) {
        const trimmed = title.trim();
        const variants: string[] = [];
        if (trimmed === title) variants.push(`${title} `); // не было пробела → ищем с
        if (trimmed !== title) variants.push(trimmed); // был пробел → ищем без
        for (const alt of variants) {
          const r = await fetchAllPages(alt);
          if (r.items.length > 0) {
            items = r.items;
            total = r.total;
            complete = r.complete;
            console.warn(
              `fetchSendlerNftsByTitle: title "${title}" → 0; fallback "${alt}" → ${items.length}`
            );
            break;
          }
        }
      }
      // Кэшируем ТОЛЬКО:
      //  - полные ответы (complete = страница не зациклилась И мы не упёрлись
      //    в total)
      //  - И при этом ответ доверяемый: Sendler либо явно сказал что 0 (total=0),
      //    либо прислал хоть один item. Если total>0 а all=0 — это глюк
      //    индексера / rate-limit, кэшировать его на 30с нельзя — потом
      //    реальный владелец будет видеть «нет на кошельке».
      const trustworthy = total === 0 || items.length > 0;
      if (complete && trustworthy) {
        cacheSet(titleCache, cacheKey, items, TITLE_TTL_MS);
      } else {
        console.warn(
          `fetchSendlerNftsByTitle(${title}) skip-cache: got=${items.length}, total=${total}, complete=${complete}`
        );
      }
      return items;
    } finally {
      titleInflight.delete(cacheKey);
    }
  })();
  titleInflight.set(cacheKey, p);
  return p;
}

/**
 * Один NFT по contract+token_id (для публичного lookup'а).
 */
export async function fetchSendlerNftById(
  contractAddress: string,
  tokenId: string
): Promise<SendlerNft | null> {
  const apiKey = process.env.SENDLER_API_KEY;
  if (!apiKey) throw new Error("SENDLER_API_KEY не сконфигурирован");

  const cacheKey = `id::${contractAddress}::${tokenId}`;
  const cached = cacheGet(idCache, cacheKey);
  if (cached !== null) return cached;

  const inflightP = idInflight.get(cacheKey);
  if (inflightP) return inflightP;

  const url = new URL(SENDLER_API_BASE);
  url.searchParams.set("contract_address", contractAddress);
  url.searchParams.set("token_id", tokenId);
  url.searchParams.set("limit", "1");

  const p = (async () => {
    try {
      const res = await fetchWithRetry(url.toString(), {
        headers: { accept: "application/json", "X-API-Key": apiKey },
      });
      if (!res.ok) return null;
      const json = (await res.json()) as { items?: SendlerNft[] };
      const item = (json.items ?? []).find((x) => x.token_id === tokenId);
      const result = item ?? null;
      cacheSet(idCache, cacheKey, result, ID_TTL_MS);
      return result;
    } finally {
      idInflight.delete(cacheKey);
    }
  })();
  idInflight.set(cacheKey, p);
  return p;
}

/**
 * Все NFT данного контракта, принадлежащие конкретному кошельку, с ПОЛНОЙ
 * пагинацией. Sendler отдаёт максимум 5000 за один запрос — здесь идём
 * страница за страницей пока не упрётся.
 *
 * Внимание: для жирных кошельков типа darai_collection.near или кош владельца
 * это 100k+ NFT = десятки запросов. По сценарию проекта приемлемо.
 *
 * MAX_PAGES — safety cap (40 * 5000 = 200k). Если у кошелька больше —
 * выкинется отсечка, но 200k уже за гранью разумного.
 *
 * Кэш и дедуп обязательны: это самый горячий вызов во всём приложении —
 * список NFT игрока запрашивается на каждом рендере экрана дропов, по каждому
 * контракту. Без них параллельные вкладки одного игрока делали по двадцать
 * страниц каждая.
 */
const ownerCache = new Map<string, CacheEntry<SendlerNft[]>>();
const ownerInflight = new Map<string, Promise<SendlerNft[]>>();
const OWNER_TTL_MS = 60_000;

export async function fetchSendlerNftsByOwner(
  contractAddress: string,
  ownerId: string,
  opts: { maxPages?: number } = {}
): Promise<SendlerNft[]> {
  const apiKey = process.env.SENDLER_API_KEY;
  if (!apiKey) throw new Error("SENDLER_API_KEY не сконфигурирован");

  const ck = `owner::${contractAddress}::${ownerId}::${opts.maxPages ?? 200}`;
  const cached = cacheGet(ownerCache, ck);
  if (cached) return cached;
  const running = ownerInflight.get(ck);
  if (running) return running;

  const job = (async () => {
    try {
      return await fetchOwnerNftsUncached(contractAddress, ownerId, apiKey, opts);
    } finally {
      ownerInflight.delete(ck);
    }
  })();
  ownerInflight.set(ck, job);
  const res = await job;
  // Пустой ответ не кэшируем: «ничего нет» и «индексер промолчал» выглядят
  // одинаково, а кэшированная пустота прячет чужие NFT на минуту.
  if (res.length > 0) cacheSet(ownerCache, ck, res, OWNER_TTL_MS);
  return res;
}

async function fetchOwnerNftsUncached(
  contractAddress: string,
  ownerId: string,
  apiKey: string,
  opts: { maxPages?: number }
): Promise<SendlerNft[]> {

  // КРИТИЧНО: endpoint `/nft/?owner_id=...` ИГНОРИРУЕТ owner_id и отдаёт
  // NFT всех владельцев в контракте (см. живой тест 2026-05-21 — total
  // 160k для конкретного wallet'а). Это приводило к тому что reserved
  // token_id принадлежал не нашему сервисному кошельку и nft_transfer
  // потом падал «not the owner».
  //
  // Правильный endpoint — `/nft/by-owner-contract/?owner_id&contract`,
  // он реально фильтрует. Шаблон из sendler-alchemy-balances/lib/sendler.js
  // (там та же логика — pagination по 200).
  const LIMIT = 200;
  const MAX_PAGES = opts.maxPages ?? 200; // покрытие до 40k NFT у одного owner
  const all: SendlerNft[] = [];
  const seen = new Set<string>();
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL(`${SENDLER_API_BASE.replace(/\/?$/, "")}/by-owner-contract/`);
    url.searchParams.set("owner_id", ownerId);
    url.searchParams.set("contract_address", contractAddress);
    url.searchParams.set("skip", String(page * LIMIT));
    url.searchParams.set("limit", String(LIMIT));

    const res = await fetchWithRetry(url.toString(), {
      headers: { accept: "application/json", "X-API-Key": apiKey },
    });
    if (!res.ok) {
      throw new Error(`Sendler API: ${res.status} ${res.statusText}`);
    }
    const json = (await res.json()) as { items?: SendlerNft[] };
    const items = (json.items ?? []).filter((x) => !!x.token_id);
    for (const it of items) {
      if (seen.has(it.token_id)) continue;
      seen.add(it.token_id);
      all.push(it);
    }
    if (items.length < LIMIT) break;
  }
  return all;
}
