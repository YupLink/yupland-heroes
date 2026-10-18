// Отчёт продаж «Экономики» — те же ключи товаров, что у журнала сделок. Сделки
// лавки города (mkt[-sell]:town:…) раньше читались как позиция маркета с id
// «town» и молча пропадали; свой товар маркета склеивался по имени позиции.
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/db/mcpClient", () => ({ mcpExec: vi.fn() }));

import { mcpExec } from "@/server/db/mcpClient";
import { parseRef } from "./admin-economy-keys";
import { collectSales } from "./admin-economy-sales";

const exec = vi.mocked(mcpExec);

const good = (id: string, refId: string | null) => ({
  id,
  kind: "custom",
  refId,
  token: null,
  operation: "both",
  marketPrice: 30,
  consumePerResident: 0,
  producePerDay: 0,
});
const TOWN = { goods: [good("tg_cuc", "cst_cuc"), good("Помидор", null)] };

function route(sql: string): unknown[] {
  if (sql.includes("FROM yuplink.acc_ledger")) {
    return [
      { ref: "mkt:town:55,21:tg_cuc:buy:acc_a:n1:p0" },
      { ref: "mkt-sell:town:55,21:tg_cuc:sell:acc_a:n2:pay" },
      { ref: "town-sell:m:48,24:Помидор:op1" },
      { ref: "mkt:mkt_ban:acc_a:n3" },
    ];
  }
  if (sql.includes("FROM yuplink.raid_market_item")) {
    return [{ id: "mkt_ban", kind: "custom", ref_id: null, name: "Бананы", give_token: null }];
  }
  if (sql.includes("FROM yuplink.raid_town")) return [{ q: 48, r: 24, config: TOWN }];
  if (sql.includes("FROM yuplink.item_alias")) return [];
  if (sql.includes("FROM yuplink.raid_custom_item ORDER BY")) {
    return [
      { id: "cst_cuc", name: "Зимние Огурцы" },
      { id: "cst_ban", name: "Банан" },
    ];
  }
  if (sql.includes("'custom' AS g")) {
    const names: Record<string, string> = { cst_cuc: "Зимние Огурцы", cst_ban: "Банан" };
    const ids = [...sql.matchAll(/'(cst_[a-z0-9_]+)'/g)].map((m) => m[1]);
    return ids.map((id) => ({ g: "custom", id, name: names[id], image: null }));
  }
  return [];
}

afterEach(() => exec.mockReset());

describe("parseRef: лавка города", () => {
  it("mkt[-sell]:town:… — товар ратуши по goodId, а не позиция «town»", () => {
    expect(parseRef("mkt:town:55,21:tg_cuc:buy:acc_a:n1")).toEqual({
      source: "town-buy",
      mapId: "",
      q: 55,
      r: 21,
      goodId: "tg_cuc",
    });
    expect(parseRef("mkt-sell:town:-3,7:tg_cuc:sell:acc_a:n2:pay")).toMatchObject({
      source: "town-sell",
      q: -3,
      r: 7,
      goodId: "tg_cuc",
    });
  });

  it("прежние формы не задеты", () => {
    expect(parseRef("mkt:mkt_1:acc:n")).toEqual({ source: "market", itemId: "mkt_1", side: "buy" });
    expect(parseRef("mkt-sell:mkt_1:acc:n")).toEqual({
      source: "market",
      itemId: "mkt_1",
      side: "sell",
    });
    expect(parseRef("town-buy:m:48,24:tg_x:op")).toMatchObject({
      source: "town-buy",
      goodId: "tg_x",
    });
  });
});

describe("collectSales: ключи как у журнала", () => {
  it("лавка города и маркет — по имени канона шаблона", async () => {
    exec.mockImplementation(async (sql: string) => route(sql));
    const out = await collectSales("true");
    expect(out).toEqual(
      expect.arrayContaining([
        { key: "custom:name:зимние огурцы", kind: "player_buys", units: 1 },
        { key: "custom:name:зимние огурцы", kind: "town_buys", units: 1 },
        { key: "custom:name:помидор", kind: "town_buys", units: 1 },
        { key: "custom:name:банан", kind: "player_buys", units: 1 },
      ]),
    );
    expect(out).toHaveLength(4);
  });
});
