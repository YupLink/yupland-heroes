// Поселения ВСЕЙ зоной: что должно держаться, когда их не одно, а десяток.
//
// Отдельный файл от settlement.test.ts (расстановка) и settlement.roads.test.ts
// (улицы): там проверяют одно поселение, здесь — как они уживаются друг с
// другом. Ловушка нашлась именно тут: центры разносятся на size, а радиус у
// каждого пятна size/2, поэтому соседние пятна СОПРИКАСАЮТСЯ. Пока память о
// занятых клетках была своя на каждое поселение, второе ставило двор поверх
// первого — в отчёте две постройки, на карте одна.
import { describe, expect, it } from "vitest";
import { planSettlements } from "@/lib/raid/zonegen/settlement";
import type { ZoneCell } from "@/lib/raid/zonegen/recipe";
import { recipe } from "@/test/zonegenFixture";
import { HALL, HOUSE, HUT, input, key, settlement, terrainWith } from "@/test/settlementFixture";

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, -1],
  [-1, 1],
] as const;

const SLOTS = [
  { buildingId: HALL.id, count: 1 },
  { buildingId: HOUSE.id, count: 0, fill: true },
  { buildingId: HUT.id, count: 0, fill: true },
];

/** Поле 40×40 с морем по западу, дорогой поперёк и россыпью занятых клеток. */
function zone() {
  const cells: ZoneCell[] = [];
  for (let q = 0; q < 40; q++) for (let r = 0; r < 40; r++) cells.push({ q, r });
  const terrainOf = terrainWith(cells, (c) => c.q < 6);
  const occupied = new Set(cells.filter((c) => (c.q * 7 + c.r * 13) % 37 === 0).map(key));
  const roads = new Set(cells.filter((c) => c.r === 15).map(key));
  const free = new Set(cells.filter((c) => !occupied.has(key(c))).map(key));
  return { cells, terrainOf, occupied, roads, free };
}

/** Прогон десяти поселений заданного размера на этом поле. */
function run(seed: number, size: number) {
  const z = zone();
  const s = settlement({ count: 10, size, density: 0.7, roadId: "r_dirt", slots: SLOTS });
  const base = input({}, { cells: z.cells, free: z.free, occupied: z.occupied, roads: z.roads });
  const res = planSettlements({
    ...base,
    terrainOf: z.terrainOf,
    recipe: recipe({ seed, settlement: s }),
  });
  return { ...z, ...res };
}

describe("поселения всей зоной", () => {
  it("десять поселений не делят ни одной клетки и не врут в отчёте", () => {
    const bad: string[] = [];
    // Перебор держим коротким намеренно: поле 40×40 на прогон, а тесты ходят
    // пачкой — длинный перебор отваливался по таймауту, а не по существу.
    for (let seed = 1; seed <= 8; seed++) {
      for (const size of [3, 8, 16]) {
        const r = run(seed, size);
        const at = new Map(r.structures.map((x) => [key(x), x]));
        const homes = r.structures.filter((x) => x.buildingId !== undefined);
        const say = (msg: string) => bad.push(`сид ${seed}, размер ${size}: ${msg}`);
        // Отчёт считает поставленное, а не задуманное: разошлись — двор затёрт.
        if (r.report.buildings !== homes.length) {
          say(`в отчёте ${r.report.buildings} дворов, на карте ${homes.length}`);
        }
        for (const h of homes) {
          const k = key(h);
          if (r.terrainOf.get(k) === "water") say(`двор на воде ${k}`);
          if (r.occupied.has(k)) say(`двор на занятой клетке ${k}`);
          if (r.roads.has(k)) say(`двор на дороге зоны ${k}`);
          if (h.roadId !== undefined && h.roadId !== null) say(`двор и дорога одним патчем ${k}`);
          for (const [dq, dr] of DIRS) {
            if (at.get(`${h.q + dq},${h.r + dr}`)?.buildingId !== undefined) {
              say(`дворы вплотную у ${k}`);
            }
          }
        }
        for (const x of r.structures) {
          if (x.tier !== undefined && x.buildingId === undefined)
            say(`тир без постройки ${key(x)}`);
          if (!r.free.has(key(x))) say(`патч вне зоны ${key(x)}`);
        }
      }
    }
    expect([...new Set(bad)].slice(0, 10).join("\n")).toBe("");
  });

  // Найденный случай: на сплошном поле 30×30 двенадцать поселений размера 8
  // сходятся так, что пятна касаются, и двенадцатое ставит двор на чужую
  // клетку. Держим его отдельным тестом — общий перебор выше его не ловит.
  it("пятна соприкоснулись — двор не затирает чужой двор", () => {
    const s = settlement({ count: 12, size: 8, density: 0.7, roadId: "r_dirt", slots: SLOTS });
    const r = planSettlements({ ...input(), recipe: recipe({ seed: 14, settlement: s }) });
    const homes = r.structures.filter((x) => x.buildingId !== undefined);
    expect(r.report.buildings).toBe(homes.length);
    expect(r.report.places).toBeGreaterThan(8);
  });

  it("тот же сид — тот же ответ клетка в клетку", () => {
    expect(JSON.stringify(run(987654, 7))).toBe(JSON.stringify(run(987654, 7)));
  });
});
