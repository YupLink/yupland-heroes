// Подтяжка «Золота» (прибыль с продаж): SQL истории и очков.
import { describe, expect, it } from "vitest";
import { historySql, profitSql } from "./tour-profit";

const flat = (s: string) => s.replace(/\s+/g, " ");

describe("золото — подтяжка прибыли", () => {
  it("история: товары с продажей за золото в окне, все записи товара у всех до конца окна", () => {
    const sql = flat(historySql(1000, 2000));
    expect(sql).toContain(
      "side = 'sell' AND price_cur = 'gold' AND at >= to_timestamp(1000 / 1000.0)",
    );
    expect(sql).toContain("JOIN items i ON i.item_key = j.item_key");
    expect(sql).toContain("WHERE j.at < to_timestamp(2000 / 1000.0)");
    expect(sql).toContain("j.map_id || ':' || j.q || ',' || j.r END AS place");
    // Чей мешочек и чья сеть сундука; ключ «Забрать сундук» — для остатка в мешочке.
    expect(sql).toContain("j.price_cur, j.counterparty, j.ref,");
  });

  it("история: и товар, отданный в уплату за покупку проданного (цена едет в покупку)", () => {
    const sql = flat(historySql(1000, 2000));
    expect(sql).toContain("SELECT item_key FROM sold UNION SELECT p.item_key");
    expect(sql).toContain("p.source = 'market' AND p.side = 'pay'");
    expect(sql).toContain("b.ref = regexp_replace(p.ref, ':pay[0-9]+:[0-9]+$', '')");
  });

  it("очки: ref от id сделки, только у идущего турнира, отметка окна тем же оператором", () => {
    const sql = flat(profitSql("t1", 2000, [{ id: "77", account: "acc_a", at: 1500, profit: 30 }]));
    expect(sql).toContain("('t1', 'sale:77', 'acc_a', 30::numeric, to_timestamp(1500 / 1000.0))");
    expect(sql).toContain("t.status IN ('running', 'paying')");
    expect(sql).toContain("ON CONFLICT (tournament_id, ref) DO NOTHING");
    expect(sql).toContain("SET synced_at = to_timestamp(2000 / 1000.0)");
  });

  it("без прибыли — только отметка окна", () => {
    const sql = flat(profitSql("t1", 2000, []));
    expect(sql).toContain("WHERE false");
    expect(sql).toContain("SET synced_at");
  });
});
