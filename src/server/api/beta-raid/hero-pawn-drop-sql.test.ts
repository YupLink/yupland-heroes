// SQL высыпания рюкзака сданного героя (§8.73 п. 4): локи рюкзаков (по порядку),
// клетки и мешочка — до WITH; только оплаченные, невозвращённые снимки без живого
// экземпляра; гриб DARAI не трогаем; изношенная штука сгорает, как у «Выбросить».
import { describe, expect, it } from "vitest";
import { pawnDropSql } from "./hero-pawn-drop-sql";

const sql = pawnDropSql({
  ops: ["op:2", "op:1"],
  account: "acc1",
  mapId: "map1",
  q: 3.7,
  r: -2.2,
  bagId: null,
  key: "pawnbag:op:2",
});

describe("pawnDropSql", () => {
  it("локи: рюкзаки героев сделок по порядку id, потом клетка, потом мешочек — всё до WITH", () => {
    const at = (s: string) => sql.indexOf(s);
    expect(sql).toContain("ORDER BY p.instance->>'id';");
    expect(at("hashtext('bp:' || (p.instance->>'id'))")).toBeLessThan(at("'lootdrop:map1:3:-3'"));
    expect(at("'lootdrop:map1:3:-3'")).toBeLessThan(at("'lootbag:' ||"));
    expect(at("'lootbag:' ||")).toBeLessThan(at("WITH heroes AS"));
    expect(sql).toContain("('lb_' || md5('pawnbag:op:2'))");
  });

  it("только оплаченные и невозвращённые, экземпляра с тем же id нет", () => {
    expect(sql).toContain("p.paid_at IS NOT NULL AND p.restored_at IS NULL");
    expect(sql).toContain("WHERE p.op IN ('op:2', 'op:1') AND p.instance->>'id' IS NOT NULL");
    expect(sql).toContain("ON CONFLICT (id) DO UPDATE SET updated_at = now()");
    expect(sql).toContain("NOT EXISTS (SELECT 1 FROM yuplink.hero_instance hi WHERE hi.id = p.instance->>'id')");
  });

  it("гриб DARAI остаётся; изношенная штука сгорает; одинаковые стопки — одной порцией", () => {
    expect(sql).toContain("h.stack_key NOT LIKE 'dmine:%'");
    expect(sql).toContain("GREATEST(0, g.count - CASE WHEN COALESCE(g.wear, 0) > 0 THEN 1 ELSE 0 END)");
    expect(sql).toContain("GROUP BY g.stack_key");
    expect(sql).toContain("ON CONFLICT (bag_id, stack_key, expires_at) DO UPDATE");
    expect(sql).toContain("'pawn'");
  });

  it("надетые артефакты — в мешочек снимком, кроме надетых на другого героя", () => {
    expect(sql).toContain("p.instance->'equipped'");
    expect(sql).toContain("DELETE FROM yuplink.user_game_item u USING eq");
    expect(sql).toContain("u.account_id = 'acc1' AND u.kind = 'artifact'");
    expect(sql).toContain("jsonb_each_text(hi.equipped) x WHERE x.value = u.id");
    expect(sql).toContain("INSERT INTO yuplink.raid_loot_bag_art (item_id, account_id, item)");
    expect(sql).toContain("'art:' || g.id AS stack_key");
    expect(sql).toContain("(EXISTS (SELECT 1 FROM agg) OR EXISTS (SELECT 1 FROM arts))");
  });
});
