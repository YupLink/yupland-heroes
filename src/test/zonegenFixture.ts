// Обвязка тестов генератора зон: рецепт, опыт карты и помощники сравнения.
//
// Вынесена отдельно, потому что тесты раскладки и тесты декора живут в разных
// файлах (потолок 250 строк), а рецепт с опытом карты им нужен один и тот же —
// две копии разъехались бы на первой же правке весов.
import { expect } from "vitest";
import type { ZoneGenerateArgs } from "@/lib/raid/zonegen/generate";
import {
  DEFAULT_WARP,
  type Affinity,
  type ZoneCell,
  type ZoneRecipe,
} from "@/lib/raid/zonegen/recipe";
import { defaultSettlement } from "@/lib/raid/zonegen/settlement-types";

export const ok = (cond: boolean, msg: string): void => {
  expect(cond, msg).toBe(true);
};
export const near = (a: number, b: number, tol: number, msg: string) =>
  ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (допуск ${tol})`);

/** Прямоугольник w×h гексов — 2000 клеток при 50×40. */
export const rect = (w: number, h: number): ZoneCell[] => {
  const out: ZoneCell[] = [];
  for (let q = 0; q < w; q++) for (let r = 0; r < h; r++) out.push({ q, r });
  return out;
};

export const NAMES: Record<string, string> = { water: "Вода", grass: "Трава", sand: "Песок" };

export const recipe = (over: Partial<ZoneRecipe> = {}): ZoneRecipe => ({
  seed: 4242,
  layers: [
    { terrainId: "grass", weight: 50 },
    { terrainId: "sand", weight: 30 },
    { terrainId: "water", weight: 20 },
  ],
  scale: 12,
  warp: DEFAULT_WARP,
  decorRate: 1,
  decorStrict: true,
  smallSingle: 12,
  settlement: defaultSettlement(),
  ...over,
});

export const EMPTY: Affinity = { byTerrain: {}, global: [] };

/**
 * Опыт карты: на траве админ ставил декор в половине клеток (ёлки 80/20 с
 * кустами), на воде — «ставил» ёлки: это ловушка для проверки запрета.
 */
export const AFF: Affinity = {
  byTerrain: {
    grass: {
      total: 200,
      decorated: 100,
      pool: [
        { decorationId: "tree", n: 80 },
        { decorationId: "bush", n: 20 },
      ],
    },
    water: { total: 50, decorated: 50, pool: [{ decorationId: "tree", n: 50 }] },
  },
  global: [
    { decorationId: "tree", n: 130 },
    { decorationId: "rock", n: 10 },
  ],
};

export const args = (over: Partial<ZoneGenerateArgs> = {}): ZoneGenerateArgs => ({
  cells: rect(50, 40),
  occupied: new Set(),
  recipe: recipe(),
  affinity: EMPTY,
  terrainNames: NAMES,
  ...over,
});
