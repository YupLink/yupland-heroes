// Два счёта на одном кошельке: пул карты и деньги под раздачу холдерам.
//
// На darai_gdrop.near лежит одна куча DARAI. Коллекция досыпает туда под
// раздачи с карты, игроки платят оттуда же за билеты, паки и энергию. Раздача
// по холдерам считалась от ВСЕГО остатка — то есть могла раздать деньги, уже
// обещанные карте. Разделение простое: сколько внесла коллекция — столько
// принадлежит карте, остальное свободно.
//
// Три числа отвечают на три разных вопроса:
//   mapReserved       — что карта ещё может разложить по объектам;
//   payoutAvailable   — что можно раздать холдерам, не залезая в пул карты;
//   playerObligations — что придётся вернуть, если игроки пойдут выводить.
import { createServerFn } from "@tanstack/react-start";
import { requireAdmin } from "../auth";
import { mcpExec } from "../db/mcpClient";
import {
  poolRef,
  insertPoolMove,
  insertPoolRelease,
  poolMoveByRef,
  poolTotals,
} from "./darai-pools-move";

import { POOL_RECEIVER_WALLET as POOL_RECEIVER } from "./darai-pools-sync";

export { syncCollectionDeposits } from "./darai-pools-sync";
export type { SyncResult, CollectionTransfer } from "./darai-pools-sync";
export { POOL_SOURCE_WALLET, POOL_RECEIVER_WALLET } from "./darai-pools-sync";

const DARAI_FT_CONTRACT = "darai.tkn.near";
const DARAI_DECIMALS = 18;
/** Токен ресурсного счёта. Это он же on-chain darai.tkn.near, не GDarai. */
const LEDGER_TOKEN = "Darai";

export type DaraiPools = {
  /** Сколько DARAI физически на darai_gdrop.near. */
  walletBalance: number;
  /** Остаток пула карты (внесено коллекцией минус заложено). Может уйти в
   *  минус: карту разложили щедрее, чем пополнили. */
  mapReserved: number;
  /** Сколько можно раздавать холдерам, не трогая пул карты. */
  payoutAvailable: number;
  /** Введено игроками и ещё не выведено. Награды НЕ считаются. */
  playerObligations: number;
  /** Всего внесено коллекцией за всё время. */
  collectionDeposited: number;
  /** Чисто заложено под объекты карты (брони минус снятые брони). */
  mapSpent: number;
  /**
   * Сколько из обещанного ЕЩЁ стоит на карте (живые объекты). Разница с
   * mapSpent — то, что игроки уже унесли: обещание стало выплатой.
   *
   * Без этого числа пул читался как «деньги куда-то утекают сами»: он падает
   * при каждой новой закладке, а возвращается только если объект снять.
   */
  onMapNow: number;
  /** Положительные остатки DARAI на счетах игроков (внесённое + награды). */
  playersOnAccounts: number;
  /** Награды рейда, которые игроки ещё не забрали (живые, не сгоревшие). */
  rewardsQueue: number;
  /** Выводы и зачисления DARAI в работе (redemptions pending/processing). */
  inFlight: number;
  /** Неполученные подарки DARAI. */
  giftsPending: number;
  /** Корзины подписки «Сжечь» и «Разработчикам» — ждут своей пачки. */
  subReserve: number;
  /** Пришло с казны на склад, но пулу ещё не зачтено (30 минут отстоя). */
  unsettledDeposits: number;
  /** Старый DARAI-счёт игроков (до единого счёта) — на него ещё покупают. */
  legacyBalances: number;
  /** Незабранные награды недельного босса. */
  bossRewards: number;
  /** DARAI стеками на складах игроков (урожай грядок). */
  warehouseDarai: number;
  /** Ручные заявки на раздачу/выплату, ждущие кнопки в Telegram. */
  pendingRequests: number;
  /** Фонды идущих турниров: из пула карты списаны бронью, подарками ещё не стали. */
  tournamentFunds: number;
  /** Банк замка: касса лицензий и DARAI в пулах банка. */
  bankDarai: number;
};

// Запрос раскладки — в darai-pools-sql.ts (лимит 250 строк).
import { POOLS_SQL } from "./darai-pools-sql";

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Остаток DARAI на складе. Читалку берём ту же, что у экрана раздачи
 * (payouts-balance) — она ходит через пул RPC с failover; вторая копия
 * разошлась бы с первой на первой же правке.
 *
 * Сеть не ответила — отдаём 0, а не роняем всю раскладку: экран раздачи
 * считает от этого числа, и «нечего раздавать» безопаснее, чем белый экран.
 */
async function walletBalanceHuman(): Promise<number> {
  try {
    const [{ fetchDaraiBalance }, { rawToHuman }] = await Promise.all([
      import("./payouts-balance"),
      import("../near"),
    ]);
    const raw = await fetchDaraiBalance(POOL_RECEIVER);
    return Number(rawToHuman(raw.toString(), DARAI_DECIMALS));
  } catch (e) {
    console.warn("[darai-pool] остаток склада не прочитался:", e instanceof Error ? e.message : e);
    return 0;
  }
}

/**
 * Все числа разом. Сеть спрашиваем параллельно с базой.
 *
 * strict — для авторассылки: любая часть не прочиталась — ошибка. Экран
 * раздачи терпит сбой (0 вместо числа), а автомат раздал бы по такому счёту
 * деньги игроков: без раскладки обязательств «свободным» стал бы весь кошелёк.
 */
export async function daraiPools(opts: { strict?: boolean } = {}): Promise<DaraiPools> {
  // Сначала подтягиваем свежие пополнения с кошелька коллекции: сканер живёт
  // отдельно и раньше не вызывался вообще, из-за чего отправленные на склад
  // деньги в пул не попадали (darai-pools-refresh).
  const strict = opts.strict === true;
  const { refreshPoolDeposits, unsettledDeposits } = await import("./darai-pools-refresh");
  let unsettled: number;
  if (strict) {
    // Автомату — свежий скан без глушения ошибок: пополнение казны, которое
    // пул ещё не зачёл, иначе выглядело бы свободными деньгами.
    const { syncCollectionDeposits } = await import("./darai-pools-sync");
    unsettled = (await syncCollectionDeposits()).unsettled;
  } else {
    await refreshPoolDeposits();
    unsettled = unsettledDeposits();
  }
  const { tokenOnMap } = await import("./token-free-pool");
  const [rows, walletBalance, onMapNow] = await Promise.all([
    mcpExec(POOLS_SQL, { wrapJson: true }) as Promise<Array<Record<string, unknown>> | null>,
    walletBalanceHuman(),
    strict ? tokenOnMap(LEDGER_TOKEN, true) : tokenOnMap(LEDGER_TOKEN).catch(() => 0),
  ]);
  if (strict && !rows?.[0]) throw new Error("Раскладка пулов не прочиталась");
  const r = rows?.[0] ?? {};
  const mapReserved = num(r.map_reserved);
  const held = {
    playersOnAccounts: num(r.players),
    rewardsQueue: num(r.queue),
    inFlight: num(r.in_flight),
    giftsPending: num(r.gifts),
    subReserve: num(r.subs),
    unsettledDeposits: unsettled,
    legacyBalances: num(r.legacy),
    bossRewards: num(r.boss),
    warehouseDarai: num(r.warehouse),
    pendingRequests: num(r.requests),
    tournamentFunds: num(r.tournaments),
    bankDarai: num(r.bank),
  };
  return {
    walletBalance,
    mapReserved,
    // Свободно к раздаче = кошелёк минус ВСЁ, что уже чьё-то: пул карты, обещанное на
    // карте, счета игроков, награды в очереди, выводы в работе, подарки, корзины подписки,
    // пополнения казны в отстое, старые счета, награды босса, склады, ждущие ручные заявки
    // (владелец, 29.09), фонды турниров, банк. Отрицательный пул раздачу не увеличивает:
    // перерасход карты — долг карты.
    payoutAvailable:
      walletBalance -
      Math.max(0, mapReserved) -
      onMapNow -
      held.playersOnAccounts -
      held.rewardsQueue -
      held.inFlight -
      held.giftsPending -
      held.subReserve -
      held.unsettledDeposits -
      held.legacyBalances -
      held.bossRewards -
      held.warehouseDarai -
      held.pendingRequests -
      held.tournamentFunds -
      held.bankDarai,
    ...held,
    playerObligations: num(r.obligations),
    collectionDeposited: num(r.collection_deposited),
    mapSpent: num(r.map_spent),
    onMapNow,
  };
}

export const getDaraiPools = createServerFn({ method: "GET" }).handler(
  async (): Promise<DaraiPools> => {
    requireAdmin();
    return daraiPools();
  },
);

export type PoolWriteResult = { ok: boolean; balanceAfter: number };

/**
 * Заложить DARAI под объект карты. Идемпотентна по `ref`: повтор транспорта
 * или второй клик по той же кнопке НЕ спишут дважды.
 *
 * `ref` — это identity объекта, а не операции: «награда клетки 42» надо
 * передавать одной и той же строкой. Если по этому ref уже стоит бронь на
 * ДРУГУЮ сумму, сумма не меняется (иначе повтор транспорта переписывал бы
 * бронь) — под новую сумму нужен новый ref, а старую снять `releaseMapDarai`.
 */
export async function reserveMapDarai(
  ref: string,
  amount: number,
  note?: string,
): Promise<PoolWriteResult> {
  if (!(Number.isFinite(amount) && amount > 0)) {
    throw new Error("reserveMapDarai: сумма брони должна быть больше нуля");
  }
  const key = poolRef("map_reserve", ref);
  const r = await insertPoolMove({ kind: "map_reserve", amount: -amount, ref: key, note });
  if (!r.inserted) {
    const existing = await poolMoveByRef(key);
    if (existing && Math.abs(existing.amount + amount) > 1e-8) {
      console.warn(
        `[darai-pool] ref=${ref} уже занят бронью на ${-existing.amount}, ` +
          `просили ${amount} — оставляем старую`,
      );
    }
  }
  return { ok: true, balanceAfter: (await poolTotals()).reserved };
}

/**
 * Снять бронь: объект убрали или награду с него забрали. Сумма берётся из
 * самой брони — «на глазок» вернуло бы в пул больше, чем оттуда брали.
 *
 * `ok: false` — брони под таким ref не было и снимать нечего.
 */
export async function releaseMapDarai(ref: string, note?: string): Promise<PoolWriteResult> {
  const releaseRef = poolRef("map_release", ref);
  await insertPoolRelease({
    reserveRef: poolRef("map_reserve", ref),
    releaseRef,
    note,
  });
  // Вставилось или уже стояло — оба случая «снято». Ноль строк на пустом
  // источнике неотличим от повтора, поэтому спрашиваем результат, а не попытку.
  const released = await poolMoveByRef(releaseRef);
  return { ok: released !== null, balanceAfter: (await poolTotals()).reserved };
}

export { DARAI_FT_CONTRACT, DARAI_DECIMALS };
