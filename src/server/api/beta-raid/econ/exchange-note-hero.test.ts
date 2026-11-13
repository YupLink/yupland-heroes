// Журнал сделок: герой, сданный в ломбард «Любым героем», — «продал» по шаблону
// сданной копии (как «любой артефакт»), а не псевдо-ключом hero:hero_any_*:
// иначе продажа не сошлась бы с покупкой того же героя в лавке (hero:<шаблон>).
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MarketItem } from "@/lib/marketItem";
import type { TradeNote } from "@/server/api/beta-raid/econ/trade-journal";

const st = vi.hoisted(() => ({
  rows: [] as TradeNote[],
  trades: [] as Array<Record<string, unknown>>,
}));
vi.mock("@/server/api/beta-raid/econ/trade-journal", () => ({
  noteTrades: async (rows: TradeNote[]) => void st.rows.push(...rows),
}));
vi.mock("@/server/api/beta-raid/econ/trade-hooks", () => ({
  noteMarketTrade: async (o: Record<string, unknown>) => void st.trades.push(o),
}));
vi.mock("@/server/api/beta-raid/econ/canon-key", () => ({
  marketTradeKey: async (m: { kind: string; refId: string | null }) => `${m.kind}:${m.refId}`,
}));
vi.mock("@/server/api/beta-raid/market-payout-meta", () => ({
  payoutMeta: async (_r: string, t: string | null) => (t ? { name: t, image: null } : null),
}));

import { noteMarketSell } from "@/server/api/beta-raid/econ/exchange-note";

const item = {
  id: "mkt_h",
  q: 1,
  r: 2,
  side: "sell",
  kind: "hero",
  refId: "hero_any_rare",
  giveAmount: 1,
  name: "Любой редкий герой",
  priceResource: "gold",
  priceToken: null,
  priceAmount: 100,
  price2Resource: null,
} as unknown as MarketItem;

afterEach(() => {
  st.rows.length = 0;
  st.trades.length = 0;
});

describe("ломбард героев в журнале", () => {
  it("«продал» — по шаблону сданной копии, псевдо-ключа нет", async () => {
    await noteMarketSell({
      item,
      account: "acc",
      mapId: "m",
      qty: 1,
      ratio: 1,
      payouts: [{ res: "gold", token: null, amount: 100 }],
      receipt: { paidHeroes: [{ op: "ref", itemId: "ugi_1", templateId: "hero_A" }] },
      ref: "ref",
    });
    expect(st.trades).toEqual([]);
    expect(st.rows).toHaveLength(1);
    expect(st.rows[0]).toMatchObject({ side: "sell", itemKey: "hero:hero_A", qty: 1, total: 100 });
  });
});
