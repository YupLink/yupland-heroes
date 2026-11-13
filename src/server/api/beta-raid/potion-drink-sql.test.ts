// Текст оператора «выпить зелья»: всё — в одном вызове, каждая запись — под
// ключом `mark`, ключ — только когда списываются ВСЕ виды. Поведение этого
// текста на живом Postgres проверено в BEGIN … ROLLBACK (22.10.2026): успех,
// повтор моста, повтор нажатия, нехватка вида, сбой на последнем эффекте.
import { describe, expect, it } from "vitest";
import { potionDrinkSql, type DrinkSqlInput } from "./potion-drink-sql";
import { drinkEffects } from "./potion-drink-plan";
import type { BoostRoll } from "@/lib/hero/boost";

let n = 0;
const input = (rolls: BoostRoll[], extra: Partial<DrinkSqlInput> = {}): DrinkSqlInput => ({
  op: "op_1",
  mark: "items:2#m1",
  heroId: "h1",
  account: "acc1",
  stat: "atk",
  amount: 5,
  need: [
    { stackKey: "custom:cst_a", qty: 3 },
    { stackKey: "custom:cst_b", qty: 2 },
  ],
  effects: drinkEffects(rolls),
  satietyHero: { heroId: "h1", max: 100 },
  newId: () => `bpe_t${++n}`,
  ...extra,
});

const ALL: BoostRoll[] = [
  { stat: "atk", amount: 3, minutes: 30 },
  { stat: "immune", amount: 1, minutes: 30, ability: "all" },
  { stat: "oblivion", amount: 2, minutes: 30 },
  { stat: "satiety", amount: 15, minutes: 0 },
];

/** Изменяющие CTE (имя → тело) из WITH. */
const writers = (sql: string): string[] =>
  [...sql.matchAll(/(\w+) AS \(\s*(INSERT|UPDATE|DELETE)/g)].map((m) => m[1]);

describe("potionDrinkSql", () => {
  it("локи — отдельными операторами ДО WITH; ответ — последним оператором", () => {
    const sql = potionDrinkSql(input(ALL));
    const parts = sql
      .split(/;\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean);
    expect(parts).toHaveLength(3);
    expect(parts[0]).toContain("hashtext('oblivion:acc1')");
    expect(parts[1]).toContain("hashtext('bp:h1')");
    expect(parts[2].startsWith("WITH prior AS")).toBe(true);
    expect(parts[2]).toMatch(/SELECT row_to_json\(_t\.\*\) AS _row/);
  });

  it("без забвения в наборе — без его лока", () => {
    const sql = potionDrinkSql(input([{ stat: "atk", amount: 1, minutes: 30 }]));
    expect(sql).not.toContain("oblivion:");
    expect(sql).toContain("hashtext('bp:h1')");
  });

  it("ключ — только когда списываются все виды и ключа ещё нет", () => {
    const sql = potionDrinkSql(input(ALL));
    expect(sql).toMatch(
      /WHERE \(SELECT count\(\*\) FROM src\) = 2\s+ON CONFLICT \(op\) DO NOTHING/,
    );
    expect(sql).toMatch(
      /h\.count >= need\.n AND NOT EXISTS \(SELECT 1 FROM prior\)\s+FOR UPDATE OF h/,
    );
  });

  it("каждая запись — под ключом этого выполнения", () => {
    const sql = potionDrinkSql(input(ALL));
    const w = writers(sql);
    expect(w).toEqual(["mark", "upd", "del", "buff", "timed", "obl_lvt", "sat"]);
    for (const name of w.filter((x) => x !== "mark")) {
      const body = sql.slice(
        sql.indexOf(`${name} AS (`),
        sql.indexOf("RETURNING", sql.indexOf(`${name} AS (`)),
      );
      expect(body, name).toMatch(/EXISTS \(SELECT 1 FROM mark\)|FROM mark\b/);
    }
  });

  it("правила эффектов — общие с одиночной выдачей: продление иммунитета и сложение забвения", () => {
    const sql = potionDrinkSql(input(ALL));
    expect(sql).toContain(
      "expires_at = GREATEST(yuplink.beta_raid_player_effects.expires_at, now())",
    );
    expect(sql).toContain(
      "CASE WHEN e.expires_at > now() THEN GREATEST(e.value, 0) ELSE 0 END + EXCLUDED.value",
    );
    expect(sql).toContain("'buff_atk', 3, now() + interval '30 minutes'");
    expect(sql).toContain("LEAST(100, COALESCE(h.satiety, 100)) + (15)");
  });

  it("сытость без героя не пишется; пустой набор — ошибка построения", () => {
    expect(potionDrinkSql(input(ALL, { satietyHero: null }))).not.toContain("sat AS");
    expect(() => potionDrinkSql(input(ALL, { need: [] }))).toThrow("пустой набор");
  });
});
