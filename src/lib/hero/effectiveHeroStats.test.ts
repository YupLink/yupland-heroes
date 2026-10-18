// «Баг на комонках» (15.09.2026): шаблон с расой, но без спеца давал нули на
// любом уровне и подпись «раса не распознана». Закрепляем: раса известна →
// база по запасному Воину и отдельный флаг; расы нет → по-прежнему нули.
import { describe, expect, it } from "vitest";
import { effectiveHeroStats } from "@/lib/hero/effectiveHeroStats";
import { FALLBACK_SPEC, HERO_STAT_KEYS, heroStatsAt, resolveSpec } from "@/lib/heroStats";

describe("heroStatsAt / resolveSpec", () => {
  it("эталон спеки: Кабан-Маг 10 ур → броня 48", () => {
    expect(heroStatsAt("Кабан", "Маг", 10).arm).toBe(48);
    expect(resolveSpec("Кабан", "Маг")).toBe("Маг");
  });

  it("раса есть, спеца нет → считаем как FALLBACK_SPEC, а не нули", () => {
    expect(FALLBACK_SPEC).toBe("Воин");
    expect(resolveSpec("Дракон", null)).toBe("Воин");
    expect(resolveSpec("Пчела", "")).toBe("Воин");
    expect(resolveSpec("Пчела", "Жрец")).toBe("Воин");
    expect(heroStatsAt("Дракон", null, 15)).toEqual(heroStatsAt("Дракон", "Воин", 15));
    expect(heroStatsAt("Дракон", null, 15)).toEqual({
      atk: 6,
      arm: 33,
      int: 8,
      spd: 34,
      hp: 62,
      luck: 6,
    });
  });

  it("расы нет в таблице → нули и null-спец", () => {
    expect(resolveSpec(null, "Маг")).toBeNull();
    expect(resolveSpec("Гоблин", "Маг")).toBeNull();
    for (const k of HERO_STAT_KEYS) expect(heroStatsAt("Гоблин", "Маг", 15)[k]).toBe(0);
  });
});

describe("effectiveHeroStats", () => {
  it("Дракон без спеца на 15 ур: база по Воину, specFallback, раса распознана", () => {
    const v = effectiveHeroStats({ race: "Дракон", spec: null, level: 15 });
    expect(v.unknownRace).toBe(false);
    expect(v.specFallback).toBe(true);
    expect(v.base).toEqual(heroStatsAt("Дракон", "Воин", 15));
    expect(v.stats.hp).toBe(62);
    // Фактический спец в ответе остаётся пустым — подмена только в числах.
    expect(v.spec).toBeNull();
  });

  it("незнакомая раса → unknownRace, нули, без specFallback", () => {
    const v = effectiveHeroStats({ race: "Гоблин", spec: "Маг", level: 15 });
    expect(v.unknownRace).toBe(true);
    expect(v.specFallback).toBe(false);
    for (const k of HERO_STAT_KEYS) expect(v.stats[k]).toBe(0);
  });

  it("полная пара: без флагов, эталон сходится", () => {
    const v = effectiveHeroStats({ race: "Кабан", spec: "Маг", level: 10 });
    expect(v.unknownRace).toBe(false);
    expect(v.specFallback).toBe(false);
    expect(v.base.arm).toBe(48);
  });

  it("артефакт «Воин +N» герою без спеца бонуса НЕ даёт — подмена не преимущество", () => {
    const gear = [
      { itemId: "a1", statType: "armor", statAmount: 2, specialization: "Воин", specAmount: 5 },
    ];
    const noSpec = effectiveHeroStats({ race: "Дракон", spec: null, level: 15, gear });
    expect(noSpec.gear.arm).toBe(2);
    const specPart = noSpec.lines[0].parts.find((p) => p.kind === "spec");
    expect(specPart?.applied).toBe(false);
    // А настоящему Воину — даёт.
    const warrior = effectiveHeroStats({ race: "Дракон", spec: "Воин", level: 15, gear });
    expect(warrior.gear.arm).toBe(7);
  });
});

// Повышенные уровни (владелец, 02.10.2026): выше обычного потолка раса и спец
// не растут — рар на 27-м считается как на 20-м, сверху только вложенные очки.
describe("effectiveHeroStats — повышенные уровни", () => {
  it("рар 27 = рар 20 + вложенные очки, артефакты сверху", () => {
    const gear = [{ itemId: "g1", statType: "armor", statAmount: 3 }];
    const at20 = effectiveHeroStats({ race: "Кабан", spec: "Маг", level: 20, rarity: "rare", gear });
    const v = effectiveHeroStats({
      race: "Кабан",
      spec: "Маг",
      level: 27,
      rarity: "rare",
      skills: { arm: 4, luck: 2, trade: 5 },
      gear,
    });
    expect(v.level).toBe(27);
    expect(v.base).toEqual(heroStatsAt("Кабан", "Маг", 20));
    expect(v.skill).toEqual({ atk: 0, arm: 4, int: 0, spd: 0, hp: 0, luck: 2 });
    for (const k of HERO_STAT_KEYS) expect(v.stats[k]).toBe(at20.stats[k] + v.skill[k]);
    expect(v.stats.arm).toBe(heroStatsAt("Кабан", "Маг", 20).arm + 3 + 4);
  });

  it("на обычном уровне ничего не режется: эпик 27 растёт как прежде", () => {
    const v = effectiveHeroStats({ race: "Пчела", spec: "Воин", level: 27, rarity: "epic" });
    expect(v.base).toEqual(heroStatsAt("Пчела", "Воин", 27));
  });

  it("лег 55 стоит на 40-м; без редкости — по уровню как раньше", () => {
    const leg = effectiveHeroStats({ race: "Дракон", spec: "Маг", level: 55, rarity: "legendary" });
    expect(leg.base).toEqual(heroStatsAt("Дракон", "Маг", 40));
    const old = effectiveHeroStats({ race: "Дракон", spec: "Маг", level: 55 });
    expect(old.base).toEqual(heroStatsAt("Дракон", "Маг", 55));
    expect(old.skill).toEqual({ atk: 0, arm: 0, int: 0, spd: 0, hp: 0, luck: 0 });
  });
});
