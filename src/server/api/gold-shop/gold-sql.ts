// Запросы магазина золота (миграция gold-shop-01): пакеты, квитанция нажатия и
// сама покупка — SQL-функция gold_shop_buy (списание, золото, квитанция и деньги
// по корзинам одной транзакцией). Только сервер: зовётся динамическим импортом.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import type { GoldToken } from "@/lib/goldShop";
import type { SplitLine } from "@/lib/energySub";

/** Пакет из базы — без цен по курсу (их считает витрина). */
export type GoldOfferRow = { id: string; gold: number; priceUsd: number; discountPct: number };

/** Ответ покупки: квитанция и что зачислено на самом деле. */
export type GoldReceipt = {
  id: string;
  gold: number;
  token: GoldToken;
  spent: number;
  applied: boolean;
};

type RawOffer = {
  id: string;
  gold: number | string;
  price_usd: number | string;
  discount_pct: number | string;
};

const toOffer = (r: RawOffer): GoldOfferRow => ({
  id: String(r.id),
  gold: Number(r.gold),
  priceUsd: Number(r.price_usd),
  discountPct: Number(r.discount_pct) || 0,
});

/** Пакеты на витрине — только включённые, по порядку. */
export async function loadGoldOffers(): Promise<GoldOfferRow[]> {
  const rows = (await mcpExec(
    `SELECT id, gold, price_usd, discount_pct FROM yuplink.gold_shop_offer
      WHERE active ORDER BY sort_order, gold;`,
    { wrapJson: true },
  )) as RawOffer[] | null;
  return (rows ?? []).map(toOffer).filter((o) => o.gold > 0 && o.priceUsd > 0);
}

/** Один включённый пакет; null — нет такого или выключен. */
export async function loadGoldOffer(id: string): Promise<GoldOfferRow | null> {
  const rows = (await mcpExec(
    `SELECT id, gold, price_usd, discount_pct FROM yuplink.gold_shop_offer
      WHERE id = ${sqlStr(id)} AND active;`,
    { wrapJson: true },
  )) as RawOffer[] | null;
  return rows?.[0] ? toOffer(rows[0]) : null;
}

/** Ключ нажатия — тот же, что строит gold_shop_buy. */
export const goldOpRef = (account: string, offerId: string, opId: string) =>
  `gshop:${account}:${offerId}:${opId}`;

/** Квитанция уже проведённого нажатия (повтор после обрыва связи); null — не было. */
export async function findGoldReceipt(opRef: string): Promise<GoldReceipt | null> {
  const rows = (await mcpExec(
    `SELECT id, gold, token, amount FROM yuplink.gold_shop_purchase WHERE op_ref = ${sqlStr(opRef)};`,
    { wrapJson: true },
  )) as Array<{
    id: string;
    gold: number | string;
    token: GoldToken;
    amount: number | string;
  }> | null;
  const r = rows?.[0];
  return r
    ? { id: r.id, gold: Number(r.gold), token: r.token, spent: Number(r.amount), applied: false }
    : null;
}

export type GoldBuyCall = {
  account: string;
  wallet: string;
  offer: GoldOfferRow;
  token: GoldToken;
  price: number;
  /** Курс DARAI за $1 — только для оплаты DARAI, иначе null. */
  rate: number | null;
  opId: string;
  /**
   * Строки раскладки денег (splitPayment) — в сумме ровно price. Строка 'ref_bb' —
   * доля фонда выкупа золота при рефке (§8.101), только вместе с `ref`.
   */
  money: Array<SplitLine | { bucket: "ref_bb"; token: string; amount: number }>;
  /** Пригласивший покупателя и его доля, % (рефка золотом, §8.101). */
  ref?: { inviter: string; pct: number } | null;
};

const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(8));

/** Покупка одной транзакцией. Отказы SQL приходят сырыми кодами (gold-buy.ts переводит). */
export async function callGoldBuy(c: GoldBuyCall): Promise<GoldReceipt> {
  const rows = (await mcpExec(
    `SELECT * FROM yuplink.gold_shop_buy(${sqlStr(c.account)}, ${sqlStr(c.wallet)},
       ${sqlStr(c.offer.id)}, ${sqlStr(c.token)}, ${c.offer.priceUsd.toFixed(2)}, ${Math.trunc(c.offer.gold)},
       ${num(c.price)}, ${c.rate != null ? String(c.rate) : "NULL"}, ${sqlStr(c.opId)},
       ${sqlStr(JSON.stringify(c.money))}::jsonb,
       ${c.ref ? `${sqlStr(JSON.stringify({ inviter: c.ref.inviter, pct: c.ref.pct }))}::jsonb` : "NULL"});`,
    { wrapJson: true },
  )) as Array<{
    r_id: string;
    r_gold: number | string;
    r_token: GoldToken;
    r_spent: number | string;
    r_applied: boolean;
  }> | null;
  const r = rows?.[0];
  if (!r?.r_id) {
    // Пустой ответ — исход неизвестен: покупка могла записаться. Сначала квитанция.
    const prev = await findGoldReceipt(goldOpRef(c.account, c.offer.id, c.opId));
    if (prev) return prev;
    throw new Error("gshop.err_unknown");
  }
  return {
    id: r.r_id,
    gold: Number(r.r_gold),
    token: r.r_token,
    spent: Number(r.r_spent),
    applied: r.r_applied === true,
  };
}
