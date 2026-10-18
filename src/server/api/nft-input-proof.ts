// Доказательство перевода NFT на наш склад. Единственный источник истины —
// Sendler; NEAR RPC сюда не входит вовсе.
//
// ПОЧЕМУ БЫЛО «ПАДАЕТ ЧЕРЕЗ РАЗ». Замер на 1035 боевых переводах в наш склад
// (момент вставки записи берётся из ObjectId, момент блока — из block_timestamp):
//   минимум 3.2 с · медиана 6.5 с · p90 9.4 с · p95 9.7 с · p99 28.6 с · максимум 38 с
//   в 10 секунд укладывается 95.7 %, в 30 секунд — 99.3 %.
// Раньше проверка была ОДНА и уходила сразу после перевода — то есть заведомо
// раньше самой быстрой (3.2 с) записи. Успевало только то, что медленно шло по
// дороге: кошелёк подтверждал перевод, летел HTTP, и запрос попадал случайной
// стороной медианы. Отсюда ровно та монетка, которую видел владелец.
//
// СТАЛО: ждём индекс лесенкой пауз до ~25 секунд (это ≥99 % случаев). Не успело
// — операция объявляется ОЖИДАЮЩЕЙ, а не проваленной: перевод-то состоялся.
//
// ОТКАЗ — только когда Sendler сказал определённо: запись про этот токен в этой
// транзакции есть, но она не про нас (не nft_transfer, ушла на чужой кошелёк,
// прислал не тот, кто просит). «Пока не вижу» отказом не считается никогда.
import { fetchSendlerNftUserHistory, type SendlerNftHistoryItem } from "../sendler";
import { fetchTokenTransfers, type SendlerTokenAction } from "../sendler-nft-lookup";
import { rowTimeMs } from "@/lib/sendlerTime";

/** Паузы перед попытками. Плотно в начале — там же и медиана индексации. */
const WAIT_STEPS_MS = [0, 2_000, 3_000, 4_000, 5_000, 5_000, 6_000];
/**
 * Потолок ожидания на живом соединении.
 *
 * Было 25 секунд — столько игрок смотрел в крутящееся колесо, а вебвью успевало
 * оборвать запрос. Теперь короткая проба: кто попал в быструю часть замеров
 * (минимум 3.2 с), получает награду сразу; остальным честно обещаем минуту и
 * доводим отложенно — с уведомлением, когда придёт. Держать соединение ради
 * последних процентов бессмысленно: медиана 6.5 с, p99 — 28.6 с.
 */
const DEFAULT_BUDGET_MS = 8_000;
/**
 * Персональный запрос на токен делаем, только когда неопознанных мало: в партии
 * на 120 NFT это была бы сотня HTTP вместо одного.
 */
const PER_TOKEN_MAX = 12;

export type TransferProof = {
  /** Перевод доказан: запись есть, отправитель и получатель совпали. */
  confirmed: Set<string>;
  /**
   * Время доказанного перевода в сети (мс). По нему ввод находит свой круг
   * NFT (src/lib/nftCycle.ts) — нельзя подставлять «сейчас».
   */
  atMs: Map<string, number>;
  /** Определённый отказ: токен → почему. */
  rejected: Map<string, string>;
  /** Ни да, ни нет — индекс ещё не догнал. Это НЕ отказ. */
  pending: string[];
  /** Сколько ждали, мс, и сколько раз спросили — для журнала и логов. */
  waitedMs: number;
  attempts: number;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Row = SendlerNftHistoryItem & SendlerTokenAction;

export async function proveNftTransfer(args: {
  wallet: string;
  contract: string;
  tokenIds: string[];
  txHash: string;
  receiverId: string;
  budgetMs?: number;
}): Promise<TransferProof> {
  const wanted = new Set(args.tokenIds.map(String));
  const confirmed = new Set<string>();
  const atMs = new Map<string, number>();
  const rejected = new Map<string, string>();
  const budget = args.budgetMs ?? DEFAULT_BUDGET_MS;
  const startedAt = Date.now();
  let attempts = 0;

  /** Ещё не решённые токены — за ними и возвращаемся на следующий круг. */
  const undecided = (): string[] =>
    [...wanted].filter((t) => !confirmed.has(t) && !rejected.has(t));

  /** Одна строка индекса про наш токен — это приговор в обе стороны. */
  const applyRow = (row: Row): void => {
    const token = row.token_id == null ? "" : String(row.token_id);
    if (!token || !wanted.has(token)) return;
    if (confirmed.has(token) || rejected.has(token)) return;
    if (row.tx_hash !== args.txHash) return;
    if (row.method !== "nft_transfer") {
      rejected.set(token, `в квитанции не перевод, а ${row.method ?? "неизвестный вызов"}`);
      return;
    }
    if (row.receiver_id !== args.receiverId) {
      rejected.set(token, `NFT ушла не на наш кошелёк (${row.receiver_id ?? "?"})`);
      return;
    }
    if (row.sender_id !== args.wallet) {
      rejected.set(token, `прислал не ты (${row.sender_id ?? "?"})`);
      return;
    }
    confirmed.add(token);
    const at = rowTimeMs(row);
    if (at != null) atMs.set(token, at);
  };

  /** Один круг опроса: общая история кошелька, потом добор по токенам. */
  const pass = async (): Promise<void> => {
    try {
      const items = await fetchSendlerNftUserHistory({
        walletId: args.wallet,
        type: "transfer",
        direction: "out",
        nftContractId: args.contract,
        limit: 200,
        // Листаем: у активного игрока последние 200 событий — это несколько
        // часов, а перевод могли сделать вчера.
        maxPages: 5,
      });
      for (const it of items) applyRow(it as Row);
    } catch (e) {
      console.warn("[nft-input-proof] история кошелька не ответила:", errText(e));
    }
    // Добор по конкретным токенам: спасает от окна в 200 записей у активного
    // кошелька и от частичной индексации партии.
    const left = undecided();
    if (left.length === 0 || left.length > PER_TOKEN_MAX) return;
    const perToken = await Promise.all(
      left.map((t) =>
        fetchTokenTransfers(args.contract, t).catch((e) => {
          console.warn(`[nft-input-proof] лента токена ${t} не ответила:`, errText(e));
          return [] as SendlerTokenAction[];
        }),
      ),
    );
    for (const rows of perToken) for (const r of rows) applyRow(r as Row);
  };

  for (const pause of WAIT_STEPS_MS) {
    if (pause > 0) {
      if (Date.now() - startedAt + pause > budget) break;
      await sleep(pause);
    }
    attempts++;
    await pass();
    if (undecided().length === 0) break;
    if (Date.now() - startedAt >= budget) break;
  }

  return {
    confirmed,
    atMs,
    rejected,
    pending: undecided(),
    waitedMs: Date.now() - startedAt,
    attempts,
  };
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
