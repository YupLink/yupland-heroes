// Дыра 06.10.2026: купил огурцы в маркете по 30 — сдал ратуше по 33. Продажа
// ратуше писалась ключом id города (custom:name:tg_…), покупка — ключом имени,
// и «Золото» засчитывало прибылью всю выручку. Ключ ратуши теперь тот же, что у
// маркета (econ/town-good-key) — прибыль = разница. Тот же вход у маркета:
// купил «Бананы» (имя позиции) — сдал скупке «Банан»; ключ — по канону (canon-key).
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/db/mcpClient", () => ({ mcpExec: vi.fn() }));

import { mcpExec } from "@/server/db/mcpClient";
import { keyFromTownGood } from "@/server/api/beta-raid/admin-economy-keys";
import { marketItemKey } from "@/server/api/beta-raid/econ/trade-keys";
import { townGoodKeyWith } from "@/server/api/beta-raid/econ/town-good-key";
import { marketTradeKey } from "@/server/api/beta-raid/econ/canon-key";
import type { MarketItem } from "@/lib/marketItem";
import type { TownGood } from "@/lib/townConfig";
import { syncGoldProfit } from "./tour-profit";

const exec = vi.mocked(mcpExec);

const cucumber: TownGood = {
  id: "tg_xxvv4a2m31",
  kind: "custom",
  refId: "cst_cuc",
  token: null,
  operation: "both",
  marketPrice: 30,
  consumePerResident: 0,
  producePerDay: 0,
};

const listing = {
  kind: "custom",
  refId: "cst_cuc",
  name: "Зимние Огурцы",
  giveToken: null,
  id: "mkt_cuc",
} as MarketItem;

/** «Купил 100 в маркете за 3000 — сдал 100 ратуше (скупке) за 3300»: очки подтяжки. */
async function pointsFor(
  sellKey: string,
  buyKey = marketItemKey(listing),
  sellSource = "town",
): Promise<string> {
  const history = [
    {
      id: "1",
      account_id: "acc_a",
      item_key: buyKey,
      at_ms: 100,
      source: "market",
      side: "buy",
      qty: 100,
      total: 3000,
      price_cur: "gold",
      place: null,
    },
    {
      id: "2",
      account_id: "acc_a",
      item_key: sellKey,
      at_ms: 200,
      source: sellSource,
      side: "sell",
      qty: 100,
      total: 3300,
      price_cur: "gold",
      place: "m:55,21",
    },
  ];
  exec.mockImplementation(async (sql: string) => {
    if (sql.includes("AS since_ms")) return [{ since_ms: 0, till_ms: 10_000 }];
    if (sql.includes("JOIN items i ON")) return history;
    return [];
  });
  await syncGoldProfit("tour_draft_gold");
  return String(exec.mock.calls.at(-1)?.[0] ?? "");
}

afterEach(() => exec.mockReset());

describe("«Золото»: купил в маркете → продал ратуше", () => {
  it("ключ ратуши как у маркета — прибыль = разница, а не выручка", async () => {
    const key = townGoodKeyWith(cucumber, new Map([["cst_cuc", "Зимние Огурцы"]]));
    const sql = await pointsFor(key as string);
    expect(sql).toContain("'sale:2', 'acc_a', 300::numeric");
    expect(sql).not.toContain("3300::numeric");
  });

  it("старый ключ по id города — вся выручка прибылью (та самая дыра)", async () => {
    const sql = await pointsFor(keyFromTownGood(cucumber) as string);
    expect(sql).toContain("'sale:2', 'acc_a', 3300::numeric");
  });

  it("купил «Бананы» в маркете — сдал скупке «Банан»: прибыль = разница", async () => {
    exec.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM yuplink.raid_custom_item ORDER BY"))
        return [{ id: "cst_ban", name: "Банан" }];
      if (sql.includes("'custom' AS g"))
        return [{ g: "custom", id: "cst_ban", name: "Банан", image: null }];
      return [];
    });
    const item = { kind: "custom", refId: null, giveToken: null } as const;
    const buyKey = await marketTradeKey({ ...item, id: "mkt_buy", name: "Бананы" });
    const sellKey = await marketTradeKey({ ...item, id: "mkt_sell", name: "Банан" });
    expect(buyKey).toBe(sellKey);
    const sql = await pointsFor(sellKey, buyKey, "market_sell");
    expect(sql).toContain("'sale:2', 'acc_a', 300::numeric");
    // Ключ по имени позиции — та самая дыра: вся выручка скупки прибылью.
    const old = await pointsFor(sellKey, "custom:name:бананы", "market_sell");
    expect(old).toContain("'sale:2', 'acc_a', 3300::numeric");
  });
});
