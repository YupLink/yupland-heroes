// Сервер + настоящий рост (без подмены placeTown): инварианты, которые обещает
// ПРАВИЛА §8.14 — облик только своего шаблона, ни одной «ненастроенной»
// постройки при автоподборе, тот же сид — тот же город клетка в клетку.
import { describe, expect, it } from "vitest";
import type { ZonePatch } from "@/lib/raid/zonegen/recipe";
import { defaultSettlement, type BuildingOption } from "@/lib/raid/zonegen/settlement-types";
import { planOrganicTowns } from "./generate-town";

const THEMES = ["Юпик", "Кабан", "Дракон", "Единорог", "Пчела"];
const o = (id: string, name: string, effect: string | null, needsConfig = false) =>
  ({
    id,
    name,
    effect,
    tiers: 2,
    needsConfig,
    skins: THEMES.map((t, i) => ({ id: `${id}_s${i}`, name: `${t} ${name}` })),
  }) as BuildingOption;

/** Срез живого справочника: службы, рынки-найм, без-эффектные и «ненастроенные». */
const CATALOG: BuildingOption[] = [
  o("hall", "Ратуша", "town_hall"),
  o("tav", "Таверна", "tavern"),
  o("wh", "Склад", "warehouse"),
  o("temple", "Храм", "boost"),
  o("forge", "Кузница", null),
  o("shop", "Лавка", null),
  o("ch", "Покои", "chambers"),
  o("bar", "Казарма - Найм войнов", "market"),
  o("m1", "Пекарня", "market"),
  o("m2", "Алхимия - Рынок", "market"),
  o("gate", "Ворота", "portal", true),
  o("mine", "Золотая шахта", "mine", true),
];

/** Гекс радиуса 14, восточный край — вода, редкий лес. */
const patches: ZonePatch[] = [];
for (let q = -14; q <= 14; q++) {
  for (let r = Math.max(-14, -q - 14); r <= Math.min(14, -q + 14); r++) {
    const tree = (q * 7 + r * 3) % 5 === 0 ? "tree" : null;
    patches.push({ q, r, terrainId: q > 9 ? "w" : "g", decorationId: tree });
  }
}

const run = (seed: number, buildings: number, count = 1) =>
  planOrganicTowns({
    settlement: { ...defaultSettlement(), enabled: true, buildings, count, roadId: "road" },
    seed,
    patches,
    occupied: new Set(),
    context: { mapRoads: new Set(["-15,0", "0,-15"]), water: new Set() },
    terrainNames: { g: "Луг", w: "Вода" },
    buildings: CATALOG,
  });

describe("planOrganicTowns с настоящим ростом", () => {
  it("облик — только из групп своего шаблона, ненастроенных нет", () => {
    for (const [seed, n] of [
      [1, 5],
      [3, 12],
      [5, 24],
    ] as const) {
      const houses = run(seed, n).structures.filter((s) => typeof s.buildingId === "string");
      expect(houses.length).toBeGreaterThan(0);
      for (const h of houses) {
        const owner = CATALOG.find((c) => c.id === h.buildingId);
        expect(owner?.needsConfig).toBe(false);
        if (h.buildingSkinId !== undefined && h.buildingSkinId !== null) {
          expect(owner?.skins?.map((s) => s.id)).toContain(h.buildingSkinId);
        }
        expect(h.decorationId).toBeNull();
      }
    }
  });

  it("тот же сид — тот же город, другой сид — другой", () => {
    expect(run(42, 12)).toEqual(run(42, 12));
    expect(run(43, 12).structures).not.toEqual(run(42, 12).structures);
  });

  it("три поселения в зоне — каждое на своём месте, клетки не делятся", () => {
    const { structures, report } = run(7, 12, 3);
    expect(report.places).toBeGreaterThanOrEqual(2);
    const keys = structures.map((s) => `${s.q},${s.r}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
