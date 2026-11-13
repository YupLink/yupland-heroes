// Миграция hero-rarity-01-fix переводит 56 обычных героев (шаблон 1★) из «rare»
// в common — а у них уровни до 22, очки навыков, по два заклинания, рюкзак на
// шесть стопок и сытость до 1819. Здесь: что от редкости экземпляра зависит и что
// после понижения ничего не падает и не теряется; и что миграция сходится с кодом.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { growthLevel, MAX_LEVEL_BY_RARITY, nextLevelCost } from "@/lib/heroLevels";
import { heroStatsAt } from "@/lib/heroStats";
import { firstFreeSlotKey, heroSlots } from "@/lib/hero/heroSlots";
import { MOUNT_SLOT } from "@/lib/hero/mount";
import { spellbookFreeSlots, spellbookSlots } from "@/lib/hero/spellbookSlots";
import { backpackCapacity, backpackRoomFor, CELL_SIZE } from "@/lib/hero/backpackCells";
import { potionBagCapacity } from "@/lib/hero/potionBag";
import { satietyOf } from "@/lib/hero/satiety";
import { canAddSkill, skillPointsView } from "@/components/heroes/heroSkillPointsView";
import { heroCardStats, heroSkillCard } from "./heroes-skill-card";
import { rarityOfTemplateLevel } from "./heroes-list-dormant";

const SQL = readFileSync(
  fileURLToPath(new URL("../../../migrations/hero-rarity-01-fix.sql", import.meta.url)),
  "utf8",
);

describe("миграция hero-rarity-01-fix сходится с кодом", () => {
  it("ярусы — те же, что у rarityOfTemplateLevel", () => {
    expect(SQL).toContain("COALESCE(lvl, 0) >= 5 THEN 'legendary'");
    expect(SQL).toContain("COALESCE(lvl, 0) >= 4 THEN 'epic'");
    expect(SQL).toContain("COALESCE(lvl, 0) >= 3 THEN 'rare'");
    expect(SQL).toContain("ELSE 'common'");
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

  it("у ставшего common остаются ровно его четыре места (heroSlots)", () => {
    const lists = [...SQL.matchAll(/e\.key (?:NOT )?IN \(([^)]*)\)/g)].map((m) =>
      m[1]
        .split(",")
        .map((x) => x.trim().replace(/^'|'$/g, ""))
        .sort(),
    );
    expect(lists.length).toBeGreaterThanOrEqual(2);
    // Конь (§8.84) появился 26.10 — миграция 22.10 о нём не знала: сверяем места артефактов.
    const common = heroSlots("common")
      .filter((d) => d.slot !== MOUNT_SLOT)
      .map((d) => d.key)
      .sort();
    for (const l of lists) expect(l).toEqual(common);
  });

  it("сначала копия, потом правка; повтор правит только расхождения и не задваивает копию", () => {
    const bak = SQL.indexOf("INSERT INTO yuplink.hero_instance_bak_20261022");
    const upd = SQL.indexOf("UPDATE yuplink.hero_instance h");
    expect(bak).toBeGreaterThan(0);
    expect(upd).toBeGreaterThan(bak);
    expect(SQL).toContain("CREATE TABLE IF NOT EXISTS yuplink.hero_instance_bak_20261022");
    expect(SQL).toContain("NOT EXISTS (SELECT 1 FROM yuplink.hero_instance_bak_20261022 b WHERE b.id = h.id)");
    expect(SQL.slice(upd)).toContain("AND h.rarity IS DISTINCT FROM pg_temp.tier_rarity(t.level);");
    expect(SQL.trimEnd().endsWith("COMMIT;")).toBe(true);
  });
});

describe("обычный на 22-м уровне с «редким» хвостом — ничего не ломается", () => {
  it("уровень: следующий закрыт, статы — от обычного потолка 10", () => {
    expect(MAX_LEVEL_BY_RARITY.common).toBe(10);
    expect(nextLevelCost("common", 22)).toBeNull();
    expect(growthLevel("common", 22)).toBe(10);
    expect(heroCardStats("Пчела", "Маг", "common", 22, {})).toEqual(
      heroStatsAt("Пчела", "Маг", 10),
    );
  });

  it("вложенные очки остаются в статах, свободных — ноль, не минус", () => {
    const sk = heroSkillCard("common", 22, { int: 1, spd: 1 });
    expect(sk).toMatchObject({ baseLevel: 10, skillEarned: 0, skillFree: 0 });
    const stats = heroCardStats("Пчела", "Маг", "common", 22, sk.skills);
    expect(stats.int).toBe(heroStatsAt("Пчела", "Маг", 10).int + 1);
    const view = skillPointsView({ id: "h", level: 22, ...sk });
    expect(view?.free).toBe(0);
    expect(canAddSkill(view, false)).toBe(false);
  });

  it("артефакты: у common четыре места, на шею надеть нельзя", () => {
    expect(heroSlots("common").map((d) => d.key)).toEqual([
      "Голова",
      "Тело",
      "Правая рука",
      "Ноги",
      MOUNT_SLOT, // конь — у любой редкости (§8.84)
    ]);
    expect(firstFreeSlotKey("common", "Шея", {})).toBeNull();
    expect(firstFreeSlotKey("common", "Тело", {})).toBe("Тело");
  });

  it("книга: одно место, два выученных — свободных ноль, учить нельзя", () => {
    expect(spellbookSlots({ spec: "Маг", rarity: "common" })).toBe(1);
    expect(spellbookFreeSlots(2, { spec: "Маг", rarity: "common" })).toBe(0);
  });

  it("рюкзак над ёмкостью: лежащее остаётся, новую ячейку не откроют, долив — можно", () => {
    expect(backpackCapacity({ spec: "Маг", rarity: "common", trade: 0 })).toBe(1);
    expect(potionBagCapacity({ rarity: "common", alchemy: 0 })).toBe(1);
    // Шесть занятых ячеек при ёмкости 1: нового вида не примут.
    expect(backpackRoomFor({ capacity: 1, cur: 0, occupied: 6 })).toBe(0);
    // Стопке до полной ячейки не хватает 8 — долить 8 в её же ячейку можно.
    expect(backpackRoomFor({ capacity: 1, cur: CELL_SIZE - 8, occupied: 6 })).toBe(8);
  });

  it("сытость выше потолка common режется до 1000, голода нет", () => {
    expect(satietyOf(1819, "common", "Маг")).toEqual({ now: 1000, max: 1000, hungry: false });
  });
});
