import { describe, expect, it } from "vitest";
import {
  ENCHANT_FISH_KEY,
  enchantStatRecord,
  enchantStatsOf,
  withEnchant,
} from "@/lib/enchant/enchantGear";
import { effectiveHeroStats } from "@/lib/hero/effectiveHeroStats";
import { explainGear } from "@/lib/hero/heroStatSources";

const ring = {
  itemId: "it_1",
  statType: "Attack",
  statAmount: 6,
  race: "Кабан",
  raceAmount: 3,
  specialization: null,
  specAmount: null,
  land: null,
  landAmount: null,
  fishBonusPct: 5,
};

describe("enchantStatsOf — все числовые статы экземпляра вверх", () => {
  it("каждое число × (1 + pct/100) с округлением вверх, пустые не трогаем", () => {
    const out = enchantStatsOf(ring, 15);
    expect(out.statAmount).toBe(7); // 6.9 → 7
    expect(out.raceAmount).toBe(4); // 3.45 → 4
    expect(out.fishBonusPct).toBe(6); // 5.75 → 6
    expect(out.specAmount).toBeNull();
    expect(out.landAmount).toBeNull();
    expect(out.statType).toBe("Attack");
  });

  it("без зачарования — тот же объект, 100% — вдвое", () => {
    expect(enchantStatsOf(ring, null)).toBe(ring);
    expect(enchantStatsOf(ring, 0)).toBe(ring);
    expect(enchantStatsOf(ring, 100).statAmount).toBe(12);
  });

  it("минус — те же статы вниз, вверх округлением (бой, снаряжение, карточки)", () => {
    const out = enchantStatsOf(ring, -20);
    expect(out.statAmount).toBe(5); // 4.8 → 5
    expect(out.raceAmount).toBe(3); // 2.4 → 3
    expect(out.fishBonusPct).toBe(4);
    expect(withEnchant({ ...ring, enchantPct: -99 }).statAmount).toBe(1);
  });

  it("withEnchant читает процент строки загрузчика", () => {
    expect(withEnchant({ ...ring, enchantPct: 10 }).statAmount).toBe(7); // 6.6 → 7
    expect(withEnchant({ ...ring, enchantPct: null }).statAmount).toBe(6);
  });
});

describe("зачарованный экземпляр даёт усиленные статы герою", () => {
  it("бой и окно снаряжения считают от умноженных чисел", () => {
    const plain = effectiveHeroStats({ race: "Кабан", spec: "Воин", level: 1, gear: [ring] });
    const boosted = effectiveHeroStats({
      race: "Кабан",
      spec: "Воин",
      level: 1,
      gear: [withEnchant({ ...ring, enchantPct: 50 })],
    });
    // Основной 6 → 9, раса 3 → 5 (4.5 вверх): прибавка к атаке 9 → 14.
    expect(boosted.gear.atk - plain.gear.atk).toBe(14 - 9);
    expect(
      explainGear(withEnchant({ ...ring, enchantPct: 50 }), { race: "Кабан", spec: null }).total,
    ).toBe(14);
  });
});

describe("enchantStatRecord — статы окна лавки", () => {
  it("подписи переводимы metaLabel, нули не показываем", () => {
    expect(enchantStatRecord(ring)).toEqual({ Attack: 6, Кабан: 3, [ENCHANT_FISH_KEY]: 5 });
    expect(
      enchantStatRecord({
        statType: "Armor",
        statAmount: 4,
        land: "terrain_x",
        landName: "Горы",
        landAmount: 2,
      }),
    ).toEqual({ Armor: 4, Горы: 2 });
  });
});
