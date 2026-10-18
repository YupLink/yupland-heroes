// Голод (сытость на нуле): все характеристики героя ×0,5 — в общей точке
// buildHeroPower, откуда считаются бой, шаг, окно героя и книга.
import { describe, expect, it } from "vitest";
import { buildHeroPower } from "./hero-power";
import type { LoadedHero } from "./hero-load";

const hero = (satiety: number | null): LoadedHero => ({
  heroId: "hero_1",
  name: "Кабан",
  imageUrl: null,
  race: "Кабан",
  spec: "Воин",
  level: 15,
  rarity: "rare",
  skills: {},
  equipped: {},
  gear: [],
  squad: [],
  satiety,
});

describe("голод", () => {
  it("сытый — характеристики полные, шкала полная", () => {
    const { info } = buildHeroPower(hero(null));
    expect(info.satiety).toEqual({ now: 1500, max: 1500, hungry: false });
    expect(Object.values(info.effects).every((v) => v === 0)).toBe(true);
  });

  it("сытость 0 — каждая характеристика вдвое меньше, снятое видно в эффектах", () => {
    const full = buildHeroPower(hero(500)).info;
    const hungry = buildHeroPower(hero(0)).info;
    expect(hungry.satiety.hungry).toBe(true);
    for (const k of Object.keys(full.stats) as Array<keyof typeof full.stats>) {
      expect(hungry.stats[k]).toBeCloseTo(full.stats[k] * 0.5, 2);
      expect(hungry.effects[k]).toBeCloseTo(-full.stats[k] * 0.5, 2);
    }
    expect(full.stats.hp).toBeGreaterThan(0);
  });
});
