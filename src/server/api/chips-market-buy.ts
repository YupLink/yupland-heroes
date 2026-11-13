// Покупка одного лота маркета фишек за ЗОЛОТО (владелец, 21.10.2026). Пачка —
// market-batch-buy.ts; обе идут одним вызовом базы market_buy_batch (market-buy-rpc.ts):
// золото покупателя, захват лота, фишка на час отдыха, 91 % продавцу, 9 % сгорает
// (строка fee в журнале), аудит — одной транзакцией под блокировкой строки лота.
// Деньги и товар не расходятся, возвратов нет: сорвался любой шаг — откатилось всё.
//   • нехватка золота — «Не хватает золота: нужно N, у тебя M» ДО вызова базы;
//   • параллельная покупка того же лота (двойное нажатие, пачка в замке, второй
//     кошелёк того же аккаунта) ждёт первую и видит лот «уже твой» — без списания;
//   • лот ушёл другому — «уже купили», без списания.
import { nanoid } from "nanoid";
import { pg } from "../db/pg";
import { accountOf } from "./user-shared";
import { assertNoDebt } from "./debt/debt-read";
import { goldOf } from "./gold-move";
import { MARKET_LOCKED, marketLockState } from "./chips-market-lock";
import { goldShortError, goldSplit, listingGoldPrice } from "./chips-market-gold";
import { marketBuyRpc } from "./market-buy-rpc";

const OWN_LISTING = "Нельзя купить свой листинг — сними его кнопкой «Снять»";

export async function buyListingAs(buyer: string, listingId: string) {
  // Должник у игроков не покупает (§8.129) — до чтения лота.
  await assertNoDebt(await accountOf(buyer));
  const l = await pg.chipMarketListings.findOne({ id: listingId });
  if (!l) throw new Error("Листинг не найден");
  if (l.status !== "active") throw new Error("Листинг уже закрыт");
  if (!l.chip_id) throw new Error("Фишка листинга не существует");
  // Лот за билеты (до 21.10) золотом не продаётся — билетов больше нет.
  const price = listingGoldPrice(l);
  if (price == null) throw new Error("Листинг уже закрыт");
  const buyerAccount = await accountOf(buyer);
  // Анти-абуз: свой же листинг купить нельзя.
  if (l.seller_account === buyerAccount) throw new Error(OWN_LISTING);
  if ((await marketLockState(buyerAccount)).locked) throw new Error(MARKET_LOCKED);

  // Нехватка — до любых движений.
  const have = await goldOf(buyerAccount);
  if (have < price) throw goldShortError(price, have);

  // Свой ключ на каждый запрос: защиту от повтора даёт блокировка лота в базе.
  const r = await marketBuyRpc({
    account: buyerAccount,
    wallet: buyer,
    ids: [l.id],
    expected: price,
    op: `one-${nanoid(12)}`,
  });
  if (r.bought.length === 0 && r.mine.length === 0) {
    throw new Error(r.failed[0]?.reason === "own" ? OWN_LISTING : "Листинг уже купили — обнови маркет");
  }
  // mine — лот уже купил этот аккаунт параллельным запросом: заплачено один раз.
  const { fee, sellerGets } = goldSplit(price);
  return { ok: true, pricePaid: price, sellerGot: sellerGets, commission: fee };
}
