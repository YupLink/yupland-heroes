// Миграция hero-rarity-02-refund: обычные герои «как будто всегда были обычными» —
// уровень 10, лайки за ступени выше 10-го назад, очков навыков нет, сытость ≤ 1000.
// Числа в SQL обязаны совпадать с кодом: если лестница цен или потолки поменяются,
// тест покажет, что миграция считает уже не то.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LEVEL_COST, MAX_LEVEL_BY_RARITY, nextLevelCost, skillPointsAt } from "@/lib/heroLevels";
import { satietyMax } from "@/lib/hero/satiety";

const SQL = readFileSync(
  fileURLToPath(new URL("../../../migrations/hero-rarity-02-refund.sql", import.meta.url)),
  "utf8",
);

/** Ступени, оплаченные лайками, у героя 22-го уровня без дерева (журнал: цена каждой). */
const paidSteps = (level: number): number[] => LEVEL_COST.slice(0, level);

describe("hero-rarity-02-refund сходится с кодом", () => {
  it("«amount >= 400» — ровно ступени с 10-го уровня и выше", () => {
    expect(SQL).toContain("FILTER (WHERE l.amount >= 400)");
    expect(LEVEL_COST[10]).toBe(400);
    // Лестница строго растёт: всё до 10-го дешевле 400, всё после — дороже.
    for (let i = 1; i < LEVEL_COST.length; i++) expect(LEVEL_COST[i]).toBeGreaterThan(LEVEL_COST[i - 1]);
    const steps = paidSteps(22);
    const above = steps.filter((a) => a >= 400).reduce((s, a) => s + a, 0);
    expect(above).toBe(LEVEL_COST.slice(10, 22).reduce((s, a) => s + a, 0));
  });

  it("переплаты rare против common за уровни 1–10 нет: лестница одна", () => {
    for (let l = 0; l < 10; l++) expect(nextLevelCost("common", l)).toBe(nextLevelCost("rare", l));
  });

  it("потолки обычного: уровень 10, очков навыков нет, сытость 1000", () => {
    expect(MAX_LEVEL_BY_RARITY.common).toBe(10);
    expect(SQL).toContain("SET level = 10,");
    for (const l of [10, 15, 22]) expect(skillPointsAt("common", l)).toBe(0);
    expect(SQL).toContain("SET skills = '{}'::jsonb,");
    for (const spec of ["Маг", "Ассасин", "Воин", null]) expect(satietyMax("common", spec)).toBe(1000);
    expect(SQL).toContain("WHEN h.satiety > 1000 THEN 1000");
  });

  it("начисление как addLikes: ключ на героя, повтор ничего не даёт", () => {
    expect(SQL).toContain("'hero_rarity_refund:' || r.id");
    expect(SQL).toContain("ON CONFLICT (ref) DO NOTHING");
    expect(SQL).toContain("FROM claim c");
    expect(SQL).toContain("lifetime_granted = yuplink.user_like_balance.lifetime_granted + EXCLUDED.lifetime_granted");
    // Уровень и likes_spent — только у тех, кто ещё выше 10-го.
    expect(SQL).toContain("WHERE r.id = h.id AND h.level > 10;");
  });

  it("одна транзакция: копии до правок, проверки до COMMIT", () => {
    const body = SQL.replace(/^--.*$/gm, "");
    expect(body.trimStart().startsWith("BEGIN;")).toBe(true);
    expect(body.trimEnd().endsWith("COMMIT;")).toBe(true);
    const bak = SQL.indexOf("INSERT INTO yuplink.hero_instance_bak_20261022_refund");
    const ulb = SQL.indexOf("INSERT INTO yuplink.user_like_balance_bak_20261022_refund");
    const grant = SQL.indexOf("INSERT INTO yuplink.like_grant_log");
    const lvl = SQL.indexOf("SET level = 10,");
    expect(bak).toBeGreaterThan(0);
    expect(ulb).toBeGreaterThan(bak);
    expect(grant).toBeGreaterThan(ulb);
    expect(lvl).toBeGreaterThan(grant);
  });
});
