// SQL и разбор обрядов зачарования героев + миграция hero-rite-01: шаблоны без
// уникальных, новая копия — одна на ключ, заявка в общий журнал, правила обряда
// держит и база.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  grantHeroSql,
  makeUniqueSql,
  riteFreeHeroesSql,
  riteClaimSql,
  riteItemKey,
  riteTemplatesSql,
  saveRitesSql,
} from "./rite-sql";
import { normalizeRite, riteOfRow } from "./rite-input";

const flat = (s: string) => s.replace(/\s+/g, " ");
const rite = {
  id: "hrite_1",
  name: "Слияние",
  rarity: "rare" as const,
  need: 3,
  success: 50,
  loseMin: 1,
  loseMax: 2,
  cost: [{ kind: "resource" as const, code: "gold", amount: 100 }],
};

describe("SQL обряда", () => {
  it("новый герой — живой шаблон яруса, кроме уникальных", () => {
    const s = flat(riteTemplatesSql("epic"));
    expect(s).toContain("t.kind = 'hero' AND COALESCE(t.active, true)");
    expect(s).toContain("WHEN COALESCE(t.level, 0) >= 4 THEN 'epic'");
    expect(s).toContain(
      "= 'epic' AND NOT (lower(COALESCE(t.meta->>'unique', '')) IN ('true', '1'))",
    );
  });

  it("копия героя — свежая (без экземпляра), повтор ключа второй не создаст", () => {
    const s = flat(
      grantHeroSql({ itemId: "ugi_rite_x", account: "acc_1", wallet: "w", templateId: "tpl" }),
    );
    expect(s).toContain("'ugi_rite_x', 'acc_1', 'w', 'tpl', 'hero', 'hero_rite'");
    expect(s).toContain("ON CONFLICT (id) DO NOTHING");
    expect(s).not.toContain("hero_instance");
  });

  it("заявка — в общий журнал зачарований, предмет — набор героев по порядку", () => {
    expect(riteItemKey(["c", "a", "b"])).toBe("heroes:a,b,c");
    const s = flat(
      riteClaimSql({
        account: "acc_1",
        op: "op_1",
        heroIds: ["b", "a", "c"],
        mapId: "m",
        q: 1,
        r: 2,
        rite,
        cost: rite.cost,
      }),
    );
    expect(s).toContain("INSERT INTO yuplink.enchant_attempt");
    expect(s).toContain("'heroes:a,b,c', NULL");
    expect(s).toContain('"kind":"hero_rite"');
    expect(s).toContain("ON CONFLICT DO NOTHING");
  });

  it("список клетки целиком: лишнее удаляется, чужой id не перезаписывается", () => {
    const s = flat(saveRitesSql("m", 1, 2, [rite]));
    expect(s).toContain(
      "DELETE FROM yuplink.raid_hero_rite WHERE map_id = 'm' AND q = 1 AND r = 2 AND id NOT IN ('hrite_1')",
    );
    expect(s).toContain("WHERE yuplink.raid_hero_rite.map_id = EXCLUDED.map_id");
    expect(saveRitesSql("m", 1, 2, [])).toContain("DELETE FROM yuplink.raid_hero_rite");
  });
});

describe("уник (§8.91)", () => {
  it("в обряд не идут уже уникальные; свободные — как у ломбарда", () => {
    const s = flat(riteFreeHeroesSql("acc_1", "legendary"));
    expect(s).toContain("AND COALESCE(h.rarity, '') <> 'unique'");
    expect(s).toContain("h.selected_at IS NULL");
    expect(s).toContain("= 'legendary'");
  });

  it("тот же экземпляр получает редкость unique; спящего будит сразу уником, под замком копии", () => {
    const s = flat(makeUniqueSql("ugi_1", "acc_1"));
    expect(s.indexOf("pg_advisory_xact_lock(hashtext('heroitem:ugi_1'))")).toBeLessThan(
      s.indexOf("WITH up"),
    );
    expect(s).toContain(
      "UPDATE yuplink.hero_instance h SET rarity = 'unique', updated_at = now() WHERE h.item_id = 'ugi_1' AND h.account_id = 'acc_1'",
    );
    expect(s).toContain("u.id, 'unique', 0, 0, '{}'::jsonb, 'inventory_item', NULL");
    expect(s).toContain(
      "NOT EXISTS (SELECT 1 FROM yuplink.hero_instance x WHERE x.item_id = u.id)",
    );
  });
});

describe("разбор обряда", () => {
  it("ошибки — ключом первой: героев 2…10, «пропадёт» ≤ героев, цена есть", () => {
    expect(() => normalizeRite({ ...rite, need: 11 })).toThrow("herorite.bad_need");
    expect(() => normalizeRite({ ...rite, loseMax: 4 })).toThrow("herorite.bad_lose");
    expect(() => normalizeRite({ ...rite, rarity: "unique" })).toThrow("enchant.bad_rarity");
    expect(() => normalizeRite({ ...rite, rarity: "common" })).toThrow("enchant.bad_rarity");
    expect(normalizeRite({ ...rite, rarity: "legendary" }).rarity).toBe("legendary");
    expect(() => normalizeRite({ ...rite, cost: [] })).toThrow("enchant.bad_cost");
    expect(normalizeRite(rite)).toEqual(rite);
  });

  it("строка базы → обряд; битая — пропуск", () => {
    const row = {
      id: "hrite_1",
      name: "Слияние",
      rarity: "rare",
      need: 3,
      success: 50,
      lose_min: 1,
      lose_max: 2,
      cost: JSON.stringify(rite.cost),
    };
    expect(riteOfRow(row)).toEqual(rite);
    expect(riteOfRow({ ...row, need: 1 })).toBeNull();
  });
});

describe("миграция hero-rite-01", () => {
  const sql = readFileSync(
    fileURLToPath(new URL("../../../../../migrations/hero-rite-01.sql", import.meta.url)),
    "utf8",
  );
  const f = flat(sql);
  it("одна транзакция, повтор безвреден, данных не трогает, обрядов заранее нет", () => {
    expect(sql).toContain("BEGIN;\nSET LOCAL lock_timeout = '5s';");
    expect(sql.trimEnd().endsWith("COMMIT;")).toBe(true);
    expect(sql).not.toMatch(/CREATE TABLE (?!IF NOT EXISTS)/);
    expect(sql).not.toMatch(/\b(DROP|DELETE|TRUNCATE|UPDATE|INSERT)\b/);
  });
  it("правила обряда держит и база", () => {
    expect(f).toContain("CHECK (rarity IN ('rare', 'epic'))");
    expect(f).toContain("CHECK (need BETWEEN 2 AND 10)");
    expect(f).toContain("CHECK (lose_min >= 0 AND lose_min <= lose_max AND lose_max <= need)");
  });
});

describe("миграция hero-rite-02", () => {
  const sql = readFileSync(
    fileURLToPath(new URL("../../../../../migrations/hero-rite-02.sql", import.meta.url)),
    "utf8",
  );
  it("обряды: можно легендарных; повтор безвреден, данных не трогает", () => {
    expect(sql).toContain("BEGIN;\nSET LOCAL lock_timeout = '5s';");
    expect(sql).toContain("DROP CONSTRAINT IF EXISTS raid_hero_rite_rarity_check");
    expect(flat(sql)).toContain("CHECK (rarity IN ('rare', 'epic', 'legendary'))");
    expect(sql).not.toMatch(/\b(DELETE|TRUNCATE|UPDATE|INSERT)\b/);
  });
});
