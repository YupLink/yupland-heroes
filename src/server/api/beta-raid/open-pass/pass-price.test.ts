// Цена «Открыть» на карте игрока: на острове — в 10 раз, до сотых, в самом SQL
// (цену сундука считает база); в мире — та же строка дословно. Потолок
// показанной цены дробный: 0,5 не округляется вниз до 0.
import { describe, expect, it } from "vitest";
import { priceOnMapSql } from "@/server/api/beta-raid/open-pass/pass-price";
import { cellsPriceSql, openPassSql } from "@/server/api/beta-raid/open-pass/pass-sql";

const flat = (s: string) => s.replace(/\s+/g, " ");
const chest = cellsPriceSql("yuplink.raid_plain_chest_slot", "s.chest_id = 'pc_1'");

describe("цена «Открыть» по карте", () => {
  it("мир — цена дословно, без обёртки", () => {
    expect(priceOnMapSql("1", "rmap_world")).toBe("1");
    expect(priceOnMapSql(chest, "rmap_world")).toBe(chest);
  });

  it("остров — ×0.1 до сотых: мешочек 1 → 0.1, сундук — десятая часть ячеек", () => {
    expect(priceOnMapSql("1", "isle_abc")).toBe("ROUND((1) * 0.1, 2)");
    expect(priceOnMapSql(chest, "isle_abc")).toBe(`ROUND((${chest}) * 0.1, 2)`);
  });

  it("потолок показанной цены — дробный: 0.1 остаётся 0.1", () => {
    const sql = flat(
      openPassSql({
        account: "acc1",
        wallet: "w1",
        target: "lb:lb_1",
        priceSql: priceOnMapSql("1", "isle_abc"),
        op: "open:o1",
        cell: { q: 1, r: 2 },
        maxPrice: 0.1,
      }),
    );
    expect(sql).toContain("price AS (SELECT (ROUND((1) * 0.1, 2))::numeric AS c)");
    expect(sql).toContain("AND price.c <= 0.1 )");
    expect(sql).not.toContain("price.c <= 0 ");
  });
});
