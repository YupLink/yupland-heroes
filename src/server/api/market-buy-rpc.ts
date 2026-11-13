// Покупка лотов маркета фишек за золото — один вызов yuplink.market_buy_batch
// (migrations/chipmkt-gold-01.sql). Общий для пачки (market-batch-buy.ts) и для
// одиночной покупки (chips-market-buy.ts): золото покупателя, захват лота, фишка,
// 91 % продавцу, журнал и аудит — одной транзакцией под блокировкой строки лота.
// Поэтому две параллельные покупки одного лота (двойное нажатие, пачка + одиночная,
// два кошелька одного аккаунта) не платят дважды и не получают товар без денег:
// вторая ждёт первую и видит лот «уже твой» (без списания) или «не куплен».
import { sb, MARKET_FEES_WALLET } from "../db/pg";
import { CHIP_REST_MS } from "../chipRest";
import { goldOf } from "./gold-move";
import { MARKET_FEE_PERCENT, goldShortError } from "./chips-market-gold";
import { noteChipMarketSale } from "./beta-raid/econ/trade-hooks";

export type MarketBought = {
  id: string;
  price: number;
  chipId: string;
  seller: string;
  sellerWallet: string;
  sellerGot: number;
};
export type MarketBuyResult = {
  bought: MarketBought[];
  /** Уже купленные этим аккаунтом раньше — без списания. */
  mine: Array<{ id: string; price: number }>;
  /** own — свой лот; gone — снят, продан другому, за билеты. */
  failed: Array<{ id: string; reason: string }>;
  spent: number;
};

function humanBatchError(msg: string): string {
  if (msg.includes("market_batch_stale") || msg.includes("market_batch_dup"))
    return "Список на экране устарел — обнови рынок и выбери заново";
  return msg || "Не удалось купить выбранные фишки";
}

/** Купить лоты ids за золото. expected — сумма, которую видел игрок; op — один на нажатие. */
export async function marketBuyRpc(p: {
  account: string;
  wallet: string;
  ids: string[];
  expected: number;
  op: string;
}): Promise<MarketBuyResult> {
  const { data: rows, error } = await sb.rpc("market_buy_batch", {
    p_buyer_account: p.account,
    p_buyer_wallet: p.wallet,
    p_ids: p.ids,
    p_expected: p.expected,
    p_op: p.op,
    p_fee_pct: MARKET_FEE_PERCENT,
    p_fees_wallet: MARKET_FEES_WALLET,
    p_rest_seconds: Math.round(CHIP_REST_MS / 1000),
  });
  if (error) {
    const msg = String(error.message ?? "");
    // Золото кончилось внутри базы (гонка) — вся покупка откатана.
    if (/в минус/.test(msg)) throw goldShortError(p.expected, await goldOf(p.account));
    throw new Error(humanBatchError(msg));
  }
  const r = (rows as Array<{ result: MarketBuyResult }> | null)?.[0]?.result;
  if (!r) throw new Error("Покупка не вернула итог — проверь рынок и баланс");

  // Журнал сделок — после покупки, на неё не влияет.
  for (const b of r.bought) {
    void noteChipMarketSale({
      listingId: b.id,
      chipId: b.chipId,
      buyer: p.account,
      seller: b.seller,
      price: Number(b.price),
      sellerGot: Number(b.sellerGot),
      priceCur: "gold",
    });
  }
  return r;
}
