// YUPLINK · Админ · сервис «Аукцион» — массовое выставление NFT на продажу
// (fixed-price) на маркете sendler-market.near. Как это работает on-chain:
//   владелец подписывает nft_batch_approve НА контракте yuplandshop.mintbase1.near
//   с {token_ids:[...], account_id:"sendler-market.near",
//      msg:'{"price":"<raw>","ft_contract":"<near|ft>"}'} + депозит 0.001 NEAR/токен.
//   Store делает cross-call → маркет создаёт sale. API только индексирует.
// (Реверс подтверждён декодом наших сделок, канон — tx HRSZr3…, см. память
//  lavka-sendler-service.) Таймед-аукцион — только по одному токену, тут не он.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "../auth";
import { pg } from "../db/pg";
import { fetchSendlerNftsByOwner, fetchSendlerNftsByTitle } from "../sendler";
import { nearRpc } from "../rpc";

export const AUCTION_NFT_CONTRACT = "yuplandshop.mintbase1.near";
export const AUCTION_MARKET = "sendler-market.near";
export const AUCTION_DEFAULT_OWNER = "darai_collection.near";
// Кошельки, которыми реально владеем/подписываем (self-signable проверен для
// darai_collection.near; sendler-alchemy.near — кастоди под вопросом, но
// оставляем выбор).
const AUCTION_OWNERS = ["darai_collection.near", "sendler-alchemy.near"] as const;

const APPROVE_DEPOSIT_PER = 1_000_000_000_000_000_000_000n; // 1e21 yocto = 0.001 NEAR/токен
const GAS_PER_CHUNK = "150000000000000"; // 150 TGas на nft_batch_approve чанка
const TX_GAS_BUDGET = 300_000_000_000_000; // клиент пакует чанки в TX по этому бюджету
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 мин; кнопка «Обновить» форсит рефетч

type CachedToken = { token_id: string; title: string; media: string };
const cacheKey = (owner: string) => `auction_tokens:${owner}`;

async function loadTokenCache(
  owner: string,
  refresh: boolean
): Promise<{ tokens: CachedToken[]; cachedAt: number }> {
  if (!refresh) {
    const row = await pg.settings.findOne({ key: cacheKey(owner) });
    if (row?.value) {
      try {
        const parsed = JSON.parse(row.value) as {
          at: number;
          tokens: CachedToken[];
        };
        if (parsed.at && Date.now() - parsed.at < CACHE_TTL_MS) {
          return { tokens: parsed.tokens, cachedAt: parsed.at };
        }
      } catch {
        /* битый кэш — перечитаем */
      }
    }
  }
  const nfts = await fetchSendlerNftsByOwner(AUCTION_NFT_CONTRACT, owner);
  const tokens: CachedToken[] = nfts.map((n) => ({
    token_id: n.token_id,
    title: (n.title ?? "").slice(0, 120),
    media: n.media ?? "",
  }));
  const at = Date.now();
  await pg.settings.upsert(
    { key: cacheKey(owner), value: JSON.stringify({ at, tokens }) },
    { onConflict: "key" }
  );
  return { tokens, cachedAt: at };
}

/**
 * Список NFT нашего кошелька для пикера: поиск (token_id/title) + пагинация +
 * кэш (кнопка «Обновить» = refresh:true перечитывает из Sendler).
 */
export const adminAuctionTokens = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        owner: z.enum(AUCTION_OWNERS).default(AUCTION_DEFAULT_OWNER),
        query: z.string().default(""),
        offset: z.number().int().min(0).default(0),
        limit: z.number().int().min(1).max(100).default(30),
        refresh: z.boolean().default(false),
        idsOnly: z.boolean().default(false), // вернуть ВСЕ id по фильтру (для «выбрать все»)
      })
      .parse(d)
  )
  .handler(async ({ data }) => {
    requireAdmin();
    const { tokens, cachedAt } = await loadTokenCache(data.owner, data.refresh);
    const q = data.query.trim().toLowerCase();
    const filtered = q
      ? tokens.filter(
          (t) =>
            t.token_id.toLowerCase().includes(q) ||
            t.title.toLowerCase().includes(q)
        )
      : tokens;
    if (data.idsOnly) {
      return {
        items: [] as CachedToken[],
        allIds: filtered.slice(0, 2000).map((t) => t.token_id),
        total: filtered.length,
        grandTotal: tokens.length,
        cachedAt,
      };
    }
    const page = filtered.slice(data.offset, data.offset + data.limit);
    return {
      items: page,
      allIds: [] as string[],
      total: filtered.length,
      grandTotal: tokens.length,
      cachedAt,
    };
  });

// human "0.5" + decimals 24 → "500000000000000000000000" (без float).
function toRawUnits(amount: string, decimals: number): string {
  const s = amount.trim();
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error("Цена — положительное число");
  const [intPart, fracRaw = ""] = s.split(".");
  const frac = fracRaw.slice(0, decimals).padEnd(decimals, "0");
  const raw = (intPart + frac).replace(/^0+/, "") || "0";
  if (raw === "0") throw new Error("Цена должна быть > 0");
  return raw;
}

async function ftDecimals(ftContract: string): Promise<number> {
  if (ftContract === "near") return 24;
  const argsB64 = Buffer.from("{}").toString("base64");
  const r = await nearRpc<{ result?: number[] }>("query", {
    request_type: "call_function",
    finality: "final",
    account_id: ftContract,
    method_name: "ft_metadata",
    args_base64: argsB64,
  });
  const bytes = r.result?.result ?? [];
  const meta = JSON.parse(Buffer.from(bytes).toString("utf8")) as {
    decimals?: number;
  };
  if (typeof meta.decimals !== "number")
    throw new Error(`ft_metadata ${ftContract}: нет decimals`);
  return meta.decimals;
}

// Storage-залог маркета (реверс + декод, high confidence): каждый слот продажи
// стоит РОВНО 1e22 yocto (0.01 NEAR). Листинг ПАДАЕТ, если у продавца
// зарезервировано меньше (active_sales + K) слотов — market-callback
// nft_on_batch_approve не несёт депозита и проверяет предоплату. Значит перед
// approve надо докинуть storage_deposit{kind:"sale"} до нужного объёма.
const STORAGE_PER_SALE = 10_000_000_000_000_000_000_000n; // 1e22 yocto = 0.01 NEAR
const STORAGE_DEPOSIT_GAS = "30000000000000"; // 30 TGas

type TxAction = {
  type: "FunctionCall";
  params: {
    methodName: string;
    args: Record<string, unknown>;
    gas: string;
    deposit: string;
  };
};
type Tx = { receiverId: string; actions: TxAction[] };

/** View-метод на маркете → распарсенный JSON (или null). */
async function marketView<T>(method: string, args: object): Promise<T | null> {
  const argsB64 = Buffer.from(JSON.stringify(args)).toString("base64");
  const r = await nearRpc<{ result?: number[] }>("query", {
    request_type: "call_function",
    finality: "final",
    account_id: AUCTION_MARKET,
    method_name: method,
    args_base64: argsB64,
  });
  const bytes = r.result?.result ?? [];
  const raw = Buffer.from(bytes).toString("utf8").trim();
  if (!raw || raw === "null") return null;
  return JSON.parse(raw) as T;
}

/** Сколько yocto докинуть в storage маркета, чтобы покрыть (active+K) слотов. */
async function storageTopupYocto(owner: string, k: number): Promise<bigint> {
  const bal = await marketView<{ sales?: string }>("storage_balance_of", {
    account_id: owner,
  });
  const sales = BigInt(bal?.sales ?? "0");
  const supply = await marketView<string | number>("get_supply_by_owner_id", {
    account_id: owner,
  });
  const active = BigInt(supply ?? 0);
  const needed = (active + BigInt(k)) * STORAGE_PER_SALE;
  return needed > sales ? needed - sales : 0n;
}

/**
 * Собрать полный список TX для выставления token_ids на продажу по единой цене:
 * [опц. storage_deposit-залог на маркет] + пачки nft_batch_approve на стор
 * (чанки по chunkSize, депозит 0.001 NEAR/токен, упакованы по газ-бюджету).
 * Клиент подписывает build.transactions последовательно кошельком-владельцем.
 */
export const adminBuildAuctionListActions = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        owner: z.enum(AUCTION_OWNERS).default(AUCTION_DEFAULT_OWNER),
        tokenIds: z.array(z.string().min(1)).min(1).max(500),
        amount: z.string().min(1), // human-цена ("0.5")
        ftContract: z.string().min(1).default("near"),
        chunkSize: z.number().int().min(1).max(40).default(15),
        signerAccount: z.string().min(1),
      })
      .parse(d)
  )
  .handler(async ({ data }) => {
    requireAdmin();
    const ft = data.ftContract.trim();
    const decimals = await ftDecimals(ft);
    const priceRaw = toRawUnits(data.amount, decimals);
    const msg = JSON.stringify({ price: priceRaw, ft_contract: ft });

    // дедуп + чанки
    const ids = Array.from(new Set(data.tokenIds));
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += data.chunkSize)
      chunks.push(ids.slice(i, i + data.chunkSize));

    // approve-экшены → пакуем в TX по газ-бюджету (стор = receiver)
    const approveActions: TxAction[] = chunks.map((chunk) => ({
      type: "FunctionCall",
      params: {
        methodName: "nft_batch_approve",
        args: { token_ids: chunk, account_id: AUCTION_MARKET, msg },
        gas: GAS_PER_CHUNK,
        deposit: (APPROVE_DEPOSIT_PER * BigInt(chunk.length)).toString(),
      },
    }));
    const approveTxs: Tx[] = [];
    let cur: TxAction[] = [];
    let g = 0;
    for (const a of approveActions) {
      const ag = parseInt(a.params.gas, 10);
      if (cur.length && g + ag > TX_GAS_BUDGET) {
        approveTxs.push({ receiverId: AUCTION_NFT_CONTRACT, actions: cur });
        cur = [];
        g = 0;
      }
      cur.push(a);
      g += ag;
    }
    if (cur.length)
      approveTxs.push({ receiverId: AUCTION_NFT_CONTRACT, actions: cur });

    // storage-залог: докидка перед approve, если не хватает слотов
    const topup = await storageTopupYocto(data.owner, ids.length);
    const transactions: Tx[] = [];
    if (topup > 0n) {
      transactions.push({
        receiverId: AUCTION_MARKET,
        actions: [
          {
            type: "FunctionCall",
            params: {
              methodName: "storage_deposit",
              args: { kind: "sale" },
              gas: STORAGE_DEPOSIT_GAS,
              deposit: topup.toString(),
            },
          },
        ],
      });
    }
    transactions.push(...approveTxs);

    return {
      contract: AUCTION_NFT_CONTRACT,
      market: AUCTION_MARKET,
      total: ids.length,
      priceRaw,
      ftContract: ft,
      decimals,
      chunks: chunks.length,
      approveDepositYocto: (APPROVE_DEPOSIT_PER * BigInt(ids.length)).toString(),
      storageTopupYocto: topup.toString(),
      txCount: transactions.length,
      transactions,
    };
  });

// ── Минт копий (как в лавке): переиспользуем media источника (без re-pin). ──
const MINT_DEPOSIT_PER = 9_870_000_000_000_000_000_000n; // 0.00987 NEAR/шт
const MINT_ROYALTY = 500; // 5%
const MINT_MAX_PER_ACTION = 40;

/** Список FT-токенов с деноминациями из нашей таблицы reward_tokens (+ NEAR). */
export const adminAuctionRewardTokens = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => d)
  .handler(async () => {
    requireAdmin();
    const rows = await pg.rewardTokens.findMany({});
    const sorted = [...rows].sort((a, b) => a.sort_order - b.sort_order);
    return [
      { ft_contract: "near", symbol: "NEAR", decimals: 24 },
      ...sorted.map((t) => ({
        ft_contract: t.ft_contract,
        symbol: t.symbol,
        decimals: t.decimals,
      })),
    ];
  });

// Кэш застаканного каталога (все типы NFT + сколько у owner'а), TTL 10 мин.
type CatalogRow = { title: string; media: string; total: number; owned: number };
const catalogKey = (owner: string) => `auction_catalog:${owner}`;
const CATALOG_TTL_MS = 10 * 60 * 1000;

async function loadCatalog(
  owner: string,
  refresh: boolean
): Promise<{ rows: CatalogRow[]; cachedAt: number }> {
  if (!refresh) {
    const row = await pg.settings.findOne({ key: catalogKey(owner) });
    if (row?.value) {
      try {
        const p = JSON.parse(row.value) as { at: number; rows: CatalogRow[] };
        if (p.at && Date.now() - p.at < CATALOG_TTL_MS)
          return { rows: p.rows, cachedAt: p.at };
      } catch {
        /* битый кэш */
      }
    }
  }
  // Все типы (collection_titles) + владение (nfts по owner_wallet).
  const [titles, owned] = await Promise.all([
    pg.collectionTitles.findMany({ contract_id: AUCTION_NFT_CONTRACT }),
    pg.nfts.findMany({
      contract_id: AUCTION_NFT_CONTRACT,
      owner_wallet: owner,
    }),
  ]);
  const ownedCount = new Map<string, number>();
  for (const n of owned) {
    const k = (n.name ?? "").trim().toLowerCase();
    if (k) ownedCount.set(k, (ownedCount.get(k) ?? 0) + 1);
  }
  const rows: CatalogRow[] = titles.map((t) => ({
    title: t.title,
    media: t.image ?? "",
    total: t.count,
    owned: ownedCount.get((t.title ?? "").trim().toLowerCase()) ?? 0,
  }));
  // owned-first, затем по тиражу, затем по имени
  rows.sort(
    (a, b) =>
      b.owned - a.owned || b.total - a.total || a.title.localeCompare(b.title)
  );
  const at = Date.now();
  await pg.settings.upsert(
    { key: catalogKey(owner), value: JSON.stringify({ at, rows }) },
    { onConflict: "key" }
  );
  return { rows, cachedAt: at };
}

/** Застаканный каталог всех типов NFT: поиск + пагинация + владение. */
export const adminAuctionCatalog = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        owner: z.enum(AUCTION_OWNERS).default(AUCTION_DEFAULT_OWNER),
        query: z.string().default(""),
        offset: z.number().int().min(0).default(0),
        limit: z.number().int().min(1).max(100).default(30),
        refresh: z.boolean().default(false),
      })
      .parse(d)
  )
  .handler(async ({ data }) => {
    requireAdmin();
    const { rows, cachedAt } = await loadCatalog(data.owner, data.refresh);
    const q = data.query.trim().toLowerCase();
    const filtered = q
      ? rows.filter((r) => r.title.toLowerCase().includes(q))
      : rows;
    const page = filtered.slice(data.offset, data.offset + data.limit);
    return {
      items: page,
      total: filtered.length,
      grandTotal: rows.length,
      cachedAt,
    };
  });

/**
 * План выставления: по items[{title, qty}] берём owned token_ids (сколько есть)
 * и на нехватку строим МИНТ-копии (nft_batch_mint owner_id=owner, media источника).
 * Возвращаем mint-транзакции (фаза 1) + owned token_ids для листинга (фаза 2).
 */
export const adminBuildAuctionPlan = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        owner: z.enum(AUCTION_OWNERS).default(AUCTION_DEFAULT_OWNER),
        items: z
          .array(
            z.object({ title: z.string().min(1), qty: z.number().int().min(1).max(200) })
          )
          .min(1),
        signerAccount: z.string().min(1),
      })
      .parse(d)
  )
  .handler(async ({ data }) => {
    requireAdmin();
    // owned token_ids по title (из нашей БД nfts)
    const owned = await pg.nfts.findMany({
      contract_id: AUCTION_NFT_CONTRACT,
      owner_wallet: data.owner,
    });
    const byTitle = new Map<string, string[]>();
    for (const n of owned) {
      const k = (n.name ?? "").trim().toLowerCase();
      if (!byTitle.has(k)) byTitle.set(k, []);
      byTitle.get(k)!.push(n.token_id);
    }

    const listTokenIds: string[] = [];
    const toMint: Array<{ title: string; count: number }> = [];
    for (const it of data.items) {
      const k = it.title.trim().toLowerCase();
      const ownedIds = byTitle.get(k) ?? [];
      const take = Math.min(it.qty, ownedIds.length);
      listTokenIds.push(...ownedIds.slice(0, take));
      const need = it.qty - take;
      if (need > 0) toMint.push({ title: it.title, count: need });
    }

    // Минт возможен только минтером контракта (darai_collection.near — да,
    // sendler-alchemy.near — нет). Если нужен минт, а кошелёк не минтер — стоп.
    if (toMint.length > 0) {
      const argsB64 = Buffer.from(
        JSON.stringify({ account_id: data.owner })
      ).toString("base64");
      const r = await nearRpc<{ result?: number[] }>("query", {
        request_type: "call_function",
        finality: "final",
        account_id: AUCTION_NFT_CONTRACT,
        method_name: "check_is_minter",
        args_base64: argsB64,
      });
      const isMinter =
        Buffer.from(r.result?.result ?? []).toString("utf8").trim() === "true";
      if (!isMinter)
        throw new Error(
          `${data.owner} не минтер yuplandshop — можно выставить только свои копии (${listTokenIds.length} шт), доминт недоступен`
        );
    }

    // mint-транзакции для нехватки
    const mintTransactions: Tx[] = [];
    for (const m of toMint) {
      const tpl = (
        await fetchSendlerNftsByTitle(AUCTION_NFT_CONTRACT, m.title)
      )[0];
      if (!tpl?.media)
        throw new Error(`Нет шаблона/медиа для минта «${m.title}»`);
      const metadata = {
        title: tpl.title ?? m.title,
        description: tpl.description ?? "",
        media: tpl.media,
        extra: JSON.stringify({ Reputation: Number(tpl.reputation ?? 0) }),
      };
      let left = m.count;
      while (left > 0) {
        const num = Math.min(left, MINT_MAX_PER_ACTION);
        left -= num;
        const deposit = (
          (MINT_DEPOSIT_PER * BigInt(num) * 105n) /
          100n
        ).toString();
        const gasNum = Math.min(280, Math.max(100, 50 + 2 * num)) * 1e12;
        mintTransactions.push({
          receiverId: AUCTION_NFT_CONTRACT,
          actions: [
            {
              type: "FunctionCall",
              params: {
                methodName: "nft_batch_mint",
                args: {
                  owner_id: data.owner,
                  metadata,
                  num_to_mint: num,
                  royalty_args: {
                    split_between: { [data.owner]: 10000 },
                    percentage: MINT_ROYALTY,
                  },
                  split_owners: null,
                },
                gas: BigInt(Math.round(gasNum)).toString(),
                deposit,
              },
            },
          ],
        });
      }
    }

    return {
      ownedTokenIds: listTokenIds,
      mintCount: toMint.reduce((s, m) => s + m.count, 0),
      mintTxCount: mintTransactions.length,
      mintTransactions,
    };
  });

/** Вытащить token_ids заминченных NFT из логов tx (EVENT_JSON nft_mint). */
export const adminExtractMintedTokenIds = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        txHashes: z.array(z.string().min(1)).min(1),
        signerAccount: z.string().min(1),
      })
      .parse(d)
  )
  .handler(async ({ data }) => {
    requireAdmin();
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const parseHash = async (h: string): Promise<string[]> => {
      const r = await nearRpc<{
        receipts_outcome?: Array<{ outcome?: { logs?: string[] } }>;
      }>("tx", [h, data.signerAccount]);
      const logs = (r.result?.receipts_outcome ?? []).flatMap(
        (ro) => ro.outcome?.logs ?? []
      );
      const out: string[] = [];
      for (const log of logs) {
        const i = log.indexOf("EVENT_JSON:");
        if (i < 0) continue;
        try {
          const ev = JSON.parse(log.slice(i + "EVENT_JSON:".length)) as {
            event?: string;
            data?: Array<{ token_ids?: string[] }>;
          };
          if (ev.event === "nft_mint")
            for (const dd of ev.data ?? []) out.push(...(dd.token_ids ?? []));
        } catch {
          /* не наш лог */
        }
      }
      return out;
    };

    const tokenIds: string[] = [];
    for (const h of data.txHashes) {
      // Ретрай: tx может ещё не проиндексироваться на выбранном RPC-эндпоинте.
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          const ids = await parseHash(h);
          if (ids.length > 0) {
            tokenIds.push(...ids);
            break;
          }
        } catch {
          /* эндпоинт не отдал — повторим */
        }
        if (attempt < 4) await sleep(2000);
      }
    }
    return { tokenIds: Array.from(new Set(tokenIds)) };
  });

// ── Таймед-аукцион (create_auction) — реверс high-confidence. ──
// Каждый аукцион: (1) penalty-залог 1 NEAR (пул на маркете, возвратный после
// продажи через withdraw_auction_penalty), (2) nft_approve create_auction на
// сторе (по ОДНОМУ токену, не батчится). Order-storage НЕ нужен.
const AUCTION_PENALTY_PER = 1_000_000_000_000_000_000_000_000n; // 1e24 = 1 NEAR/аукцион
const AUCTION_APPROVE_DEPOSIT = 1_000_000_000_000_000_000_000n; // 1e21 = 0.001 NEAR store-slot
const AUCTION_APPROVE_GAS = "60000000000000"; // 60 TGas/nft_approve (xcc create)
const PENALTY_GAS = "10000000000000"; // 10 TGas
const ANTI_SNIPE_NS = "300000000000"; // 5 мин (окно и продление)

/** Свободный penalty-баланс продавца (preflight, view-only). */
export const adminAuctionPenaltyBalance = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ owner: z.enum(AUCTION_OWNERS).default(AUCTION_DEFAULT_OWNER) }).parse(d)
  )
  .handler(async ({ data }) => {
    requireAdmin();
    try {
      const free = await marketView<string | number>(
        "get_auction_penalty_balance",
        { account_id: data.owner }
      );
      const freeYocto = BigInt(free ?? 0);
      return {
        ok: true,
        freeYocto: freeYocto.toString(),
        freeUnits: Number(freeYocto / AUCTION_PENALTY_PER),
      };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

/**
 * План создания таймед-аукционов по token_ids. Возвращает базу msg (без
 * start/end — их ставит клиент при подписи), длительность в ns, депозиты/газ и
 * докидку penalty-пула до N аукционов. Клиент собирает: [penalty-топап] +
 * N×nft_approve(create_auction) и подписывает (penalty отдельным раундом).
 */
export const adminBuildAuctionCreatePlan = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        owner: z.enum(AUCTION_OWNERS).default(AUCTION_DEFAULT_OWNER),
        tokenIds: z.array(z.string().min(1)).min(1).max(200),
        amount: z.string().min(1), // стартовая цена (human)
        ftContract: z.string().min(1).default("near"),
        durationSec: z.number().int().min(3600).max(2_592_000).default(86_400),
        minBidStepBps: z.number().int().min(1).max(10_000).default(500),
        signerAccount: z.string().min(1),
      })
      .parse(d)
  )
  .handler(async ({ data }) => {
    requireAdmin();
    const ft = data.ftContract.trim();
    const decimals = await ftDecimals(ft);
    const startPriceRaw = toRawUnits(data.amount, decimals);
    const ids = Array.from(new Set(data.tokenIds));
    const durationNs = (BigInt(data.durationSec) * 1_000_000_000n).toString();

    // penalty-пул: докинуть до N единиц (1 NEAR каждая)
    let free = 0n;
    try {
      const f = await marketView<string | number>(
        "get_auction_penalty_balance",
        { account_id: data.owner }
      );
      free = BigInt(f ?? 0);
    } catch {
      /* view упал — считаем пул пустым (перезаложим полностью) */
    }
    const needed = AUCTION_PENALTY_PER * BigInt(ids.length);
    const penaltyTopup = needed > free ? needed - free : 0n;

    return {
      market: AUCTION_MARKET,
      store: AUCTION_NFT_CONTRACT,
      tokenIds: ids,
      // min_bid_step_bps — ЧИСЛО (контракт ждёт number, не string)
      msgBase: {
        action: "create_auction",
        start_price: startPriceRaw,
        ft_contract: ft,
        min_bid_step_bps: data.minBidStepBps,
        anti_snipe_window_ns: ANTI_SNIPE_NS,
        anti_snipe_extension_ns: ANTI_SNIPE_NS,
      },
      durationNs,
      approveDeposit: AUCTION_APPROVE_DEPOSIT.toString(),
      approveGas: AUCTION_APPROVE_GAS,
      txGasBudget: TX_GAS_BUDGET,
      penaltyTopupYocto: penaltyTopup.toString(),
      penaltyPerYocto: AUCTION_PENALTY_PER.toString(),
      penaltyGas: PENALTY_GAS,
    };
  });

/** Текущий storage-баланс продавца на маркете (preflight, view-only). */
export const adminAuctionMarketStorage = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ owner: z.enum(AUCTION_OWNERS).default(AUCTION_DEFAULT_OWNER) }).parse(d)
  )
  .handler(async ({ data }) => {
    requireAdmin();
    try {
      const argsB64 = Buffer.from(
        JSON.stringify({ account_id: data.owner })
      ).toString("base64");
      const r = await nearRpc<{ result?: number[] }>("query", {
        request_type: "call_function",
        finality: "final",
        account_id: AUCTION_MARKET,
        method_name: "storage_balance_of",
        args_base64: argsB64,
      });
      const bytes = r.result?.result ?? [];
      const raw = Buffer.from(bytes).toString("utf8");
      return { ok: true, balance: raw ? (JSON.parse(raw) as unknown) : null };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  });
