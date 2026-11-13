// Свой индексатор NEAR вместо Sendler (владелец, 02.11.2026: «без подписок, не мешать другим
// сервисам»). Раз в 30 с спрашивает у бесплатного tx.main.fastnear.com историю своих адресов
// (кошельки и NFT-контракты из chain_watch), новые транзакции забирает целиком и разбирает
// (parse-block) — в базу ложатся переводы, где наш кошелёк — сторона, и события наших NFT.
// Нагрузка — единицы запросов в минуту и доли миллисекунды на разбор.
//
// Транзакцию берём, когда ей больше минуты (чеки успели исполниться); разобранные помечаем
// (chain_tx_seen), а назад от курсора адреса смотрим ещё ~30 мин — если API отстал, догоним.
// Первый запуск адреса — с недели назад. Один процесс на всех — по аренде в settings.
// Владельцы NFT двигаются той же записью (chain_nft_owner); названия новых NFT дочитываются с
// контракта (до 10 за проход).
// settings.chain_indexer = 'off' — стоп.
import { mcpExec } from "@/server/db/mcpClient";
import { parseOutcomes, type ChainWatch } from "./parse-block";
import { RateLimited, accountTxs, txOutcomes, type AccountTx } from "./fastnear";
import {
  cursorName,
  cursorsSql,
  healthSql,
  leaseSql,
  seenSql,
  titleSql,
  untitledSql,
  watchSql,
  writeSql,
} from "./chain-sql";

const POLL_MS = 30_000;
const SETTLE_MS = 60_000;
/** Блоков назад от курсора, которые перепроверяем (~30 мин при 0,56 с на блок). */
const OVERLAP = 3_000;
/** Первый запуск адреса — примерно неделя назад (0,56 с на блок). */
const FIRST_BACK = 1_100_000;
const TITLES_PER_POLL = 10;

/** Свои по умолчанию: склад и приёмник платежей, казна, пул; NFT — магазин. */
const DEFAULT_ACCOUNTS = ["darai_gdrop.near", "darai_collection.near", "darai_pool.near"];
const DEFAULT_NFT = ["yuplandshop.mintbase1.near"];

const me = `${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let started = false;

const strings = (v: unknown, dflt: string[]): string[] =>
  Array.isArray(v) && v.length && v.every((x) => typeof x === "string") ? (v as string[]) : dflt;

async function loadWatch(): Promise<{ watch: ChainWatch; off: boolean }> {
  const row = (
    (await mcpExec(watchSql(), { wrapJson: true })) as Array<{
      watch: string | null;
      mode: string | null;
      tokens: unknown;
    }>
  )[0];
  let cfg: Record<string, unknown> = {};
  try {
    cfg = row?.watch ? (JSON.parse(row.watch) as Record<string, unknown>) : {};
  } catch {
    cfg = {};
  }
  return {
    off: row?.mode === "off",
    watch: {
      accounts: new Set(strings(cfg.accounts, DEFAULT_ACCOUNTS)),
      tokens: new Set(Array.isArray(row?.tokens) ? (row.tokens as string[]) : []),
      nftContracts: new Set(strings(cfg.nftContracts, DEFAULT_NFT)),
    },
  };
}

async function cursors(): Promise<Map<string, number>> {
  const rows = (await mcpExec(cursorsSql(), { wrapJson: true })) as Array<{
    name: string;
    height: string;
  }>;
  return new Map((rows ?? []).map((r) => [r.name, Number(r.height)]));
}

/** Один адрес: новые устоявшиеся транзакции → разбор → запись. */
async function pollAccount(
  account: string,
  watch: ChainWatch,
  cursor: number | undefined,
): Promise<void> {
  const first = cursor === undefined;
  // Первый запуск: страницы до недели назад (since по высоте свежей транзакции адреса).
  const head = first ? await accountTxs(account, null, 1) : [];
  const newest = head.length ? Math.max(...head.map((t) => t.height)) : 0;
  const since = first ? newest - FIRST_BACK : cursor - OVERLAP;
  const txs = first ? await accountTxs(account, since, 10) : await accountTxs(account, since, 5);
  if (!txs.length) return;
  const now = Date.now();
  const byHash = new Map<string, AccountTx>();
  for (const t of txs) if (t.height > since && now - t.atMs > SETTLE_MS) byHash.set(t.hash, t);
  const settled = [...byHash.values()];
  if (!settled.length) return;
  const known = new Set(
    (
      (await mcpExec(seenSql([...byHash.keys()]), { wrapJson: true })) as Array<{ hash: string }>
    ).map((r) => r.hash),
  );
  const fresh = settled.filter((t) => !known.has(t.hash));
  const { items, found } = fresh.length
    ? await txOutcomes(fresh.map((t) => t.hash))
    : { items: [], found: new Set<string>() };
  const top = settled.reduce((a, t) => (t.height > a.height ? t : a));
  const sql = writeSql(
    parseOutcomes(items, watch),
    fresh
      .filter((t) => found.has(t.hash))
      .map((t) => ({ hash: t.hash, account, height: t.height })),
    [{ name: cursorName(account), height: top.height, atMs: top.atMs }],
  );
  if (sql) await mcpExec(sql, { wrapJson: false });
}

/** Названия новых NFT (минт после снимка) — с контракта, по несколько за проход. */
async function fillTitles(): Promise<void> {
  const rows = (await mcpExec(untitledSql(TITLES_PER_POLL), { wrapJson: true })) as Array<{
    contract: string;
    token_id: string;
  }>;
  if (!rows?.length) return;
  const { fetchOnchainNftTitle } = await import("@/server/api/chips-mint-deposit-helpers");
  for (const r of rows) {
    const title = await fetchOnchainNftTitle(r.contract, r.token_id).catch(() => null);
    if (title) await mcpExec(titleSql(r.contract, r.token_id, title), { wrapJson: false });
  }
}

async function holdLease(): Promise<boolean> {
  const rows = (await mcpExec(leaseSql(me), { wrapJson: false }).catch(() => [])) as unknown[];
  return rows.length > 0;
}

async function run(): Promise<void> {
  for (;;) {
    let pause = POLL_MS;
    try {
      if (!(await holdLease())) {
        await sleep(60_000);
        continue;
      }
      const { watch, off } = await loadWatch();
      if (!off) {
        const at = await cursors();
        for (const account of [...watch.accounts, ...watch.nftContracts]) {
          await pollAccount(account, watch, at.get(cursorName(account)));
        }
        await fillTitles();
      }
      // Удачный проход — в здоровье цикла: по нему сверка ловит «индексатор молчит».
      await mcpExec(healthSql(null), { wrapJson: false }).catch(() => undefined);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn("[chain] индексатор:", msg);
      if (e instanceof RateLimited) pause = 60_000;
      await mcpExec(healthSql(msg, e instanceof RateLimited), { wrapJson: false }).catch(
        () => undefined,
      );
    }
    await sleep(pause);
  }
}

/** Запустить индексатор в этом процессе (повтор — мимо). Работает тот, у кого аренда. */
export function startChainIndexer(): void {
  // Только боевой сервер: локальная разработка ходит в ту же базу и перехватывала бы аренду.
  if (started || typeof fetch !== "function" || process.env.NODE_ENV !== "production") return;
  started = true;
  void run();
  // Сверка — своим таймером и арендой: застрявший цикл опроса её не остановит.
  void import("./recon-timer").then((m) =>
    m.startReconTimer(async () => {
      const { watch } = await loadWatch();
      return { accounts: [...watch.accounts], nftContracts: [...watch.nftContracts] };
    }),
  );
}
