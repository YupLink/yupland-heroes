// Сделка в лавке города: общее для покупки (town-shop-trade) и продажи (town-shop-sell).
// Цена по кривой ратуши, деньги/товар игрока, склад. Золото ратуши — из ниоткуда.
//
// ПОРЯДОК — против «фантомного» склада: сдвинь склад раньше цены и оплаты, и на
// миг отката чужие сделки видят запас, которого нет (проваленная покупка опускает
// склад — параллельная продажа идёт дороже). Поэтому:
//   1) цена — от прочитанного запаса; хуже показанной игроку (expect) — отказ
//      ДО любых движений;
//   2) сначала забираем у игрока (золото за покупку, товар за продажу);
//   3) склад двигаем, только если он РОВНО тот, по которому считали цену (at),
//      и не ниже НЗ; сдвинулся — вернуть взятое и пересчитать
//      (до трёх раз), цена ушла хуже показанной — отказ;
//   4) товар/выплата; сбой — откат всего выше.
// Склад не сдвигает сделка, которая сорвётся по вине игрока. Валюта — золото.
import { credit, spend } from "./market-money";
import { reportUndoFailure } from "./market-undo-alert";
import { readTownStock } from "./town-stock";
import { cityLine, type CityLine, type CityShop } from "./town-shop";
import { TOWN_STARVING_KEY } from "./town-state";
import type { MarketItem, MarketPriceResource } from "@/lib/marketItem";

export const GOLD = "gold" as const;
/** Допуск сравнения с показанной ценой: копейка округления — не «цена изменилась». */
export const EXPECT_EPS = 0.005;
export const ATTEMPTS = 3;

export type Trade = {
  wallet: string;
  account: string;
  mapId: string;
  item: MarketItem;
  qty: number;
  city: CityShop;
  /** Сколько игрок видел в окне: покупка — не дороже, продажа — не дешевле. */
  expect?: number;
  payRef: string;
  nonce: string;
};

export function lineOf(t: Trade): CityLine {
  const line = cityLine(t.city, t.item);
  if (!line) throw new Error(t.city.starving ? TOWN_STARVING_KEY : "town.not_traded");
  // Без показанной суммы сверять не с чем: так приходит только старая вкладка,
  // которая рисует цену позиции, а не кривую города. Пусть обновится.
  if (t.expect == null) throw new Error("market.price_changed");
  return line;
}

/** Свежий запас товара: на повторной попытке склад уже другой. */
export async function stockNow(t: Trade, line: CityLine): Promise<number> {
  return (await readTownStock(t.city.town))[line.good.id] ?? line.curve.norm;
}

export const warn = (what: string, ref: string) => (e: unknown) =>
  console.warn(`[town-shop] ${what} не прошёл`, ref, e);

/** Вернуть игроку взятое; провал возврата — сигнал админам, а не тишина. */
export function giveBack(
  t: Trade,
  side: "buy" | "sell",
  res: MarketPriceResource,
  token: string | null,
  amount: number,
  spendRef: string,
  receipt?: Awaited<ReturnType<typeof spend>>,
): Promise<void> {
  if (!(amount > 0)) return Promise.resolve();
  const undoRef = `${spendRef}:undo`;
  return credit(t.wallet, t.account, res, token, amount, undoRef, receipt).catch((e) =>
    reportUndoFailure(
      { wallet: t.wallet, account: t.account, side, res, token, amount, spendRef, undoRef },
      e,
    ),
  );
}
