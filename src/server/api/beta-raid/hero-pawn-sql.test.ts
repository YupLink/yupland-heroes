// SQL ломбарда героев: кого можно сдать (свободен, не уникальный, редкость по
// ярусу шаблона), снятие одним оператором со снимком под замками копии и героя,
// возврат снимком, отметка выплаты.
import { describe, expect, it } from "vitest";
import {
  heroRaritySql,
  heroStateSql,
  listFreeHeroesSql,
  markPaidSql,
  pawnFreeSql,
  restoreHeroSql,
  takeHeroSql,
} from "./hero-pawn-sql";
import { heroItemLockSql } from "../hero-item-lock";
import { rarityOfTemplateLevel } from "../heroes-list-dormant";

const UNIQUE = "NOT (lower(COALESCE(t.meta->>'unique', '')) IN ('true', '1'))";

describe("редкость и «свободен»", () => {
  it("редкость — только по ярусу шаблона, rarity экземпляра не читается", () => {
    const sql = heroRaritySql("t");
    expect(sql).not.toContain("rarity");
    expect(sql).toContain("COALESCE(t.level, 0) >= 5 THEN 'legendary'");
    expect(sql).toContain("COALESCE(t.level, 0) >= 4 THEN 'epic'");
    expect(sql).toContain("COALESCE(t.level, 0) >= 3 THEN 'rare'");
    expect(sql).toContain("ELSE 'common'");
    // Пороги — те же, что у rarityOfTemplateLevel (спящий, пробуждение).
    expect([0, 1, 2, 3, 4, 5, 6].map(rarityOfTemplateLevel)).toEqual([
      "common",
      "common",
      "common",
      "rare",
      "epic",
      "legendary",
      "legendary",
    ]);
  });

  it("обычный шаблон, которому прокачка записала «rare», сдаётся как обычный", () => {
    // Список и снятие сравнивают с выбранной редкостью ярус шаблона, а не h.rarity.
    for (const sql of [
      listFreeHeroesSql("acc1", "common"),
      takeHeroSql({ account: "acc1", itemId: "u1", rarity: "common", op: "o" }),
      heroStateSql("acc1", "u1"),
    ]) {
      expect(sql).not.toContain("h.rarity");
    }
  });

  it("уникальный герой — не в списке и не снимается; причина отказа видна", () => {
    expect(listFreeHeroesSql("acc1", "rare")).toContain(UNIQUE);
    expect(takeHeroSql({ account: "acc1", itemId: "u1", rarity: "rare", op: "o" })).toContain(
      UNIQUE,
    );
    expect(heroStateSql("acc1", "u1")).toContain(
      `lower(COALESCE(t.meta->>'unique', '')) IN ('true', '1') AS "unique"`,
    );
  });

  it("свободен: спящий всегда; разбуженный — не основной, не отдыхает, не на грядке, не рыбачит, рюкзак пуст", () => {
    const sql = pawnFreeSql("h");
    expect(sql).toContain("h.id IS NULL OR");
    expect(sql).toContain("h.selected_at IS NULL");
    expect(sql).toContain("h.rest_until IS NULL OR h.rest_until <= now()");
    expect(sql).toContain("yuplink.raid_field_worker fw WHERE fw.hero_id = h.id");
    expect(sql).toContain("fi.hero_id = h.id AND fi.stopped_at IS NULL");
    // Рюкзак продаже не мешает (высыпается мешочком, §8.73 п. 4) — кроме гриба DARAI.
    expect(sql).toContain("bp.hero_id = h.id AND bp.count > 0 AND bp.stack_key LIKE 'dmine:%'");
  });

  it("список — копии аккаунта нужной редкости, только свободные, с уровнем", () => {
    const sql = listFreeHeroesSql("acc'1", "epic");
    expect(sql).toContain("u.account_id = 'acc''1' AND u.kind = 'hero'");
    expect(sql).toContain("= 'epic'");
    expect(sql).toContain("COALESCE(h.level, 0)::int AS level");
    expect(sql).toContain("LEFT JOIN yuplink.hero_instance h ON h.item_id = u.id");
  });
});

describe("снятие героя", () => {
  const sql = takeHeroSql({ account: "acc1", itemId: "ugi_1", rarity: "rare", op: "mkt-sell:x" });

  it("порядок: замок копии → замок героя → снятие", () => {
    expect(sql.startsWith(`${heroItemLockSql("ugi_1")}\n`)).toBe(true);
    expect(heroItemLockSql("ugi_1")).toBe(
      "SELECT pg_advisory_xact_lock(hashtext('heroitem:ugi_1')) AS l;",
    );
    const iItem = sql.indexOf("'heroitem:ugi_1'");
    const iHero = sql.indexOf("hashtext('hero:' || h.id)");
    const iTake = sql.indexOf("WITH cand AS");
    expect(iItem).toBeGreaterThanOrEqual(0);
    expect(iItem).toBeLessThan(iHero);
    expect(iHero).toBeLessThan(iTake);
    expect(sql).toContain("WHERE h.item_id = 'ugi_1';\nWITH cand AS");
  });

  it("кандидат — эта копия, этого аккаунта, этой редкости и свободная", () => {
    expect(sql).toContain("u.account_id = 'acc1' AND u.kind = 'hero' AND u.id = 'ugi_1'");
    expect(sql).toContain(`= 'rare' AND ${UNIQUE}\n     AND (h.id IS NULL OR`);
  });

  it("экземпляр удаляется только не основным и не отдыхающим — проверка повторена в DELETE", () => {
    expect(sql).toMatch(
      /DELETE FROM yuplink\.hero_instance x USING cand c\s+WHERE x\.id = c\.hero_id AND x\.selected_at IS NULL/,
    );
  });

  it("предмет — только если экземпляра не было или он удалён этим же оператором", () => {
    expect(sql).toContain("(c.hero_id IS NULL OR EXISTS (SELECT 1 FROM gone_h))");
  });

  it("снимок пишется тем же оператором и только за удалённую копию, ключ — сделка", () => {
    expect(sql).toContain("INSERT INTO yuplink.pawn_hero_take");
    expect(sql).toContain("SELECT 'mkt-sell:x', 'acc1', g.id, g.template_id, to_jsonb(g)");
    expect(sql).toContain("FROM gone_u g\n  ON CONFLICT (op) DO NOTHING");
    expect(sql).toContain("yuplink.hero_spellbook s, gone_h x");
    expect(sql).toContain("yuplink.hero_spell_cd cd, gone_h x");
    expect(sql).toContain("row_to_json(_t.*) AS _row");
  });
});

describe("возврат снимком", () => {
  const sql = restoreHeroSql("mkt-sell:x");

  it("предмет, экземпляр, книга и откаты — под прежними id, повтор не задваивает", () => {
    const order = [
      "INSERT INTO yuplink.user_game_item",
      "INSERT INTO yuplink.hero_instance",
      "INSERT INTO yuplink.hero_spellbook",
      "INSERT INTO yuplink.hero_spell_cd",
      "UPDATE yuplink.pawn_hero_take SET restored_at = now()",
    ].map((s) => sql.indexOf(s));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(sql.match(/ON CONFLICT/g)?.length).toBe(4);
    expect(sql).toContain("op = 'mkt-sell:x' AND restored_at IS NULL");
  });

  it("спящий герой — экземпляр не вставляется", () => {
    expect(sql).toContain("WHERE s.instance IS NOT NULL");
  });

  it("оплаченный снимок не возвращается — ни героем, ни отметкой", () => {
    expect(sql.match(/AND paid_at IS NULL/g)?.length).toBe(5);
  });
});

describe("отметка выплаты", () => {
  it("закрывает только открытые снимки этих сделок", () => {
    const sql = markPaidSql(["mkt-sell:x", "o'1"]);
    expect(sql).toContain("SET paid_at = now()");
    expect(sql).toContain("op IN ('mkt-sell:x', 'o''1')");
    expect(sql).toContain("AND restored_at IS NULL AND paid_at IS NULL");
  });
});
