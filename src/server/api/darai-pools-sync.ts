// Пополнение пула карты: переводы DARAI с кошелька коллекции на игровой склад.
//
// Источник истины — Sendler, а не NEAR RPC: публичные узлы регулярно ложатся
// всей пачкой, и любая сверка, опирающаяся на них, ложится вместе с ними
// (§11.8 ПРАВИЛА).
//
// ГЛАВНАЯ ЛОВУШКА. darai_collection.near — не только «казначей», это ещё и
// обычный игрок: с него покупали билеты, энергию и паки. Из семи переводов на
// склад за всю историю ЧЕТЫРЕ оказались покупками. Засчитать их в пул значило
// бы посчитать одни и те же деньги дважды — и как товар игроку, и как запас
// карты. Поэтому квитанция, по которой уже выдан товар, в пул не идёт; кто
// это знает — receipt-guard, там же живёт проверка «одна квитанция — один
// товар», и берём мы её оттуда, чтобы новый способ покупки автоматически
// попадал и сюда.
import { poolRef } from "./darai-pools-move";
import { insertPoolMove, poolTotals } from "./darai-pools-move";
import { sqlStr } from "./chips-utils";
import { mcpExec } from "../db/mcpClient";

/** Кошелёк, пополнения с которого и есть пул карты. */
export const POOL_SOURCE_WALLET = "darai_collection.near";
/**
 * Казначейских кошельков два: кроме коллекции пул пополняют и с darai_pool.near
 * — оттуда 09.09.2026 пришло 500 млн, и синк их просто не видел (владелец:
 * «закинуто было, но с другого кошелька»). Игроцкие адреса сюда добавлять
 * нельзя: их переводы — это покупки, а не запас карты.
 */
export const POOL_SOURCE_WALLETS = [POOL_SOURCE_WALLET, "darai_pool.near"] as const;
/** Игровой склад — он же приёмник всех платежей. */
export const POOL_RECEIVER_WALLET = "darai_gdrop.near";
const SYMBOL = "DARAI";
const DECIMALS = 18;
/** Сколько страниц по 200 листаем. Семь страниц — вся история кошелька. */
const MAX_PAGES = 30;

/**
 * Отстой перед зачётом. Покупка сначала уезжает в цепь и только потом,
 * проверенная, оставляет строку в своей таблице. Свежий перевод ещё может
 * оказаться покупкой, у которой просто не дошли руки нажать «проверить», —
 * такой в пул не берём и подождём следующего прогона.
 */
const SETTLE_MS = 30 * 60_000;

export type CollectionTransfer = {
  /** Ключ идемпотентности: квитанция перевода, а при её отсутствии — хэш tx.
   *  Одной транзакцией может уехать несколько переводов, и ключ по хэшу
   *  похоронил бы все, кроме первого (та же мина, что на вводе NFT, §8.4). */
  key: string;
  txHash: string;
  amount: number;
  atMs: number;
  memo: string;
};

/** Вся история переводов DARAI казна → склад, свежие первыми. */
export async function scanCollectionTransfers(): Promise<CollectionTransfer[]> {
  const out: CollectionTransfer[] = [];
  for (const wallet of POOL_SOURCE_WALLETS) out.push(...(await scanFromWallet(wallet)));
  // Свежие первыми — как и раньше, когда кошелёк был один.
  return out.sort((a, b) => b.atMs - a.atMs);
}

/** История одного казначейского кошелька. */
async function scanFromWallet(sourceWallet: string): Promise<CollectionTransfer[]> {
  const apiKey = process.env.SENDLER_API_KEY;
  if (!apiKey) throw new Error("SENDLER_API_KEY не сконфигурирован");
  const [{ SENDLER_API_ROOT, fetchWithRetry }, { rawToHuman }] = await Promise.all([
    import("../sendler"),
    import("../near"),
  ]);

  const out: CollectionTransfer[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL(`${SENDLER_API_ROOT}/history/ft-transfers/`);
    url.searchParams.set("wallet_id", sourceWallet);
    url.searchParams.set("direction", "out");
    url.searchParams.set("symbol", SYMBOL);
    url.searchParams.set("limit", "200");
    if (cursor) url.searchParams.set("cursor", cursor);

    const res = await fetchWithRetry(url.toString(), {
      headers: { accept: "application/json", "X-API-Key": apiKey },
    });
    if (!res.ok) throw new Error(`Sendler /history/ft-transfers: ${res.status} ${res.statusText}`);
    const json = (await res.json()) as {
      items?: Record<string, unknown>[];
      next_cursor?: string | null;
      detail?: string;
    };
    if (json.detail) throw new Error(`Sendler: ${json.detail}`);
    const items = json.items ?? [];
    for (const it of items) {
      if (String(it.receiver_id ?? "") !== POOL_RECEIVER_WALLET) continue;
      const txHash = String(it.tx_hash ?? "");
      const raw = String(it.amount ?? "0");
      if (!txHash || !/^\d+$/.test(raw)) continue;
      out.push({
        key: String(it.receipt_id ?? "") || txHash,
        txHash,
        amount: Number(rawToHuman(raw, DECIMALS)),
        // Sendler отдаёт время без зоны, но в UTC — иначе отстой считался бы
        // от местного времени сервера и пропускал бы свежие переводы.
        atMs: Date.parse(`${String(it.block_timestamp ?? "")}Z`),
        memo: String(it.memo ?? ""),
      });
    }
    cursor = json.next_cursor ?? null;
    if (!cursor || items.length === 0) break;
  }
  return out;
}

/**
 * Какие из квитанций уже превращены в товар игроку. Список проверок берём из
 * receipt-guard: там канон «одна квитанция — один товар», и появившийся завтра
 * способ покупки закроется тут сам, без правок в этом файле.
 */
export async function claimedReceipts(txHashes: string[]): Promise<Set<string>> {
  if (txHashes.length === 0) return new Set();
  const { CHECKS } = await import("./receipt-guard");
  const values = txHashes.map((t) => `(${sqlStr(t.trim().toLowerCase())})`).join(",");
  const anyOf = Object.values(CHECKS)
    .map((mk) => `EXISTS (${mk("t.tx")})`)
    .join(" OR ");
  const rows = (await mcpExec(
    `WITH t(tx) AS (VALUES ${values}) SELECT t.tx AS tx, (${anyOf}) AS claimed FROM t;`,
    { wrapJson: true },
  )) as Array<{ tx?: string; claimed?: boolean }> | null;
  return new Set((rows ?? []).filter((r) => r.claimed).map((r) => String(r.tx)));
}

export type SyncResult = {
  scanned: number;
  added: number;
  total: number;
  /** Пришло с казны, но ещё в отстое (моложе SETTLE_MS) — пулу пока не зачтено. */
  unsettled: number;
};

/**
 * Заводит новые пополнения пула. Идемпотентна по квитанции: повторный прогон
 * ничего не добавляет, поэтому её можно вешать в крон и жать руками сколько
 * угодно.
 */
export async function syncCollectionDeposits(): Promise<SyncResult> {
  const all = await scanCollectionTransfers();
  const now = Date.now();
  const isSettled = (t: CollectionTransfer) => Number.isFinite(t.atMs) && now - t.atMs > SETTLE_MS;
  const settled = all.filter(isSettled);
  // Квитанции, уже ставшие товаром или зачислением на счёт игрока, — по ВСЕМ
  // переводам, и свежим тоже: darai_collection.near ещё и игрок, и его ввод на
  // свой счёт иначе считался бы «пополнением казны в пути» поверх счёта игрока
  // (03.10: 154 млн вычлись дважды, «К распределению» показало 0).
  const claimed = await claimedReceipts(all.map((t) => t.txHash));

  let added = 0;
  for (const t of settled) {
    if (claimed.has(t.txHash.toLowerCase())) continue;
    const r = await insertPoolMove({
      kind: "collection_deposit",
      amount: t.amount,
      ref: poolRef("collection_deposit", t.key),
      note: `${t.txHash}${t.memo ? ` · ${t.memo}` : ""}`,
    });
    if (r.inserted) added++;
  }

  const totals = await poolTotals();
  const unsettled = all
    .filter((t) => !isSettled(t) && !claimed.has(t.txHash.toLowerCase()))
    .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  return { scanned: all.length, added, total: totals.deposited, unsettled };
}
