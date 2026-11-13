// Подделка SQL магазина золота для тестов (gold-buy*.test.ts) — память с той же
// семантикой, что у gold_shop_buy (миграция gold-shop-01): квитанция нажатия
// отвечает повтором без движений; выключенный/изменённый пакет и чужая сумма —
// отказ до денег; не хватает — not_enough_currency и ничего не двигается;
// списание, золото, квитанция и корзины — разом. Проверка и запись — синхронно,
// без await посередине, как под замком. В приложение не импортируется.
import type { GoldBuyCall, GoldOfferRow, GoldReceipt } from "./gold-sql";

type Offer = GoldOfferRow & { active: boolean };

export const db = {
  offers: new Map<string, Offer>(),
  receipts: new Map<string, GoldReceipt & { money: GoldBuyCall["money"] }>(),
  /** Баланс счёта: «аккаунт:токен». */
  balance: new Map<string, number>(),
  gold: new Map<string, number>(),
  /** Сколько раз ушли деньги (строки acc_spend). */
  charges: 0,
  /** Следующая покупка проводится, но ответ теряется (обрыв моста). */
  loseAnswer: false,
};

export function resetDb() {
  db.offers = new Map(
    [
      { id: "gold_100", gold: 100, priceUsd: 1, discountPct: 0 },
      { id: "gold_1k", gold: 1_000, priceUsd: 5, discountPct: 50 },
      { id: "gold_5k", gold: 5_000, priceUsd: 15, discountPct: 70 },
    ].map((o) => [o.id, { ...o, active: true }]),
  );
  db.receipts = new Map();
  db.balance = new Map([
    ["acc_A:USDT", 100],
    ["acc_A:STARS", 5_000],
    ["acc_A:Darai", 100_000_000],
  ]);
  db.gold = new Map([["acc_A", 0]]);
  db.charges = 0;
  db.loseAnswer = false;
}

const want = (o: Offer, c: GoldBuyCall): number => {
  if (c.token === "USDT") return Math.round(o.priceUsd * 100) / 100;
  if (c.token === "STARS") return Math.ceil(Number(((o.priceUsd * 1.1) / 0.013).toFixed(6)));
  if (!c.rate) throw new Error("gold_no_rate");
  return Math.ceil(o.priceUsd * 0.9 * c.rate);
};

export const fakeSql = {
  goldOpRef: (account: string, offerId: string, opId: string) =>
    `gshop:${account}:${offerId}:${opId}`,
  async loadGoldOffers(): Promise<GoldOfferRow[]> {
    return [...db.offers.values()]
      .filter((o) => o.active)
      .map((o) => ({ id: o.id, gold: o.gold, priceUsd: o.priceUsd, discountPct: o.discountPct }));
  },
  async loadGoldOffer(id: string): Promise<GoldOfferRow | null> {
    const o = db.offers.get(id);
    return o?.active
      ? { id: o.id, gold: o.gold, priceUsd: o.priceUsd, discountPct: o.discountPct }
      : null;
  },
  async findGoldReceipt(ref: string): Promise<GoldReceipt | null> {
    const r = db.receipts.get(ref);
    return r ? { id: r.id, gold: r.gold, token: r.token, spent: r.spent, applied: false } : null;
  },
  async callGoldBuy(c: GoldBuyCall): Promise<GoldReceipt> {
    const ref = fakeSql.goldOpRef(c.account, c.offer.id, c.opId);
    const prev = db.receipts.get(ref);
    if (prev)
      return { id: prev.id, gold: prev.gold, token: prev.token, spent: prev.spent, applied: false };
    const o = db.offers.get(c.offer.id);
    if (!o?.active) throw new Error(`gold_offer_off:${c.offer.id}`);
    if (o.priceUsd !== c.offer.priceUsd || o.gold !== c.offer.gold) {
      throw new Error(`gold_offer_changed:${o.id}`);
    }
    const w = want(o, c);
    if (Math.abs(c.price - w) > (c.token === "Darai" ? 1 : 0)) {
      throw new Error(`gold_price_mismatch:${c.price}:${w}`);
    }
    const sum = c.money.reduce((s, l) => s + l.amount, 0);
    if (c.money.some((l) => l.token !== c.token) || Math.abs(sum - c.price) > 1e-8) {
      throw new Error(`gold_money_sum:${sum}:${c.price}`);
    }
    const key = `${c.account}:${c.token}`;
    const have = db.balance.get(key) ?? 0;
    if (have < c.price) throw new Error(`not_enough_currency:${c.token}:${have}:${c.price}`);
    db.balance.set(key, have - c.price);
    db.charges++;
    db.gold.set(c.account, (db.gold.get(c.account) ?? 0) + o.gold);
    const id = `gsp_${db.receipts.size + 1}`;
    db.receipts.set(ref, {
      id,
      gold: o.gold,
      token: c.token,
      spent: c.price,
      applied: true,
      money: c.money,
    });
    if (db.loseAnswer) {
      db.loseAnswer = false;
      throw new Error("MCP timeout");
    }
    return { id, gold: o.gold, token: c.token, spent: c.price, applied: true };
  },
};
