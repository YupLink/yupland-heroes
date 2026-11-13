// Сводка комиссии маркета фишек для админки (/admin/payouts → «Комиссия маркета
// фишек»). С 21.10.2026 маркет за золото: комиссия 9 % сгорает, в журнале — строка
// fee с amount_gold. Билетные итоги (сделки до 20.10) остаются отдельными цифрами —
// золото и билеты не складываются.
import { createServerFn } from "@tanstack/react-start";
import { pg, MARKET_FEES_WALLET } from "../db/pg";
import { getCurrentWallet, isAdminWallet } from "../auth";
import { MARKET_FEE_PERCENT } from "./chips-market-gold";

const sum = <T,>(rows: T[], pick: (r: T) => unknown) => rows.reduce((s, r) => s + (Number(pick(r)) || 0), 0);

export const adminGetMarketStats = createServerFn({ method: "GET" }).handler(async () => {
  const w = getCurrentWallet();
  if (!w || !isAdminWallet(w)) throw new Error("Только админ");

  const { data: feeRows } = await pg.chipMarketLedger.raw().select("amount_tickets,amount_gold").eq("kind", "fee");
  const fees = (feeRows ?? []) as Array<{ amount_tickets: number | null; amount_gold: number | null }>;

  const { data: soldRows } = await pg.chipMarketListings
    .raw()
    .select("sold_price_tickets,price_gold")
    .eq("status", "sold");
  const sold = (soldRows ?? []) as Array<{ sold_price_tickets: number | null; price_gold: number | null }>;
  const soldGold = sold.filter((r) => r.price_gold != null);

  const { data: activeRows } = await pg.chipMarketListings.raw().select("id").eq("status", "active");

  return {
    feesWallet: MARKET_FEES_WALLET,
    feePercent: MARKET_FEE_PERCENT,
    totalFeesGold: sum(fees, (r) => r.amount_gold),
    turnoverGold: sum(soldGold, (r) => r.price_gold),
    soldGoldCount: soldGold.length,
    totalFeesTickets: sum(fees, (r) => r.amount_tickets),
    turnoverTickets: sum(sold, (r) => r.sold_price_tickets),
    soldCount: sold.length,
    activeListings: (activeRows ?? []).length,
  };
});
