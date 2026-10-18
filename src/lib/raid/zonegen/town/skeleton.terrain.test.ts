// Скелет поселения и местность: вода, чужое, декор, дорога карты, сид.
// `bun run test`.
//
// Спецификация (docs/town-generation-algorithm.json): blocked — ∞ (шаг 6),
// недостижимые ворота получают прорезанный путь (шаг 15), дорога карты — ось
// и спицы (шаги 4, 6), тот же сид в той же области — тот же город клетка в
// клетку, при любом порядке входа (шаг 0).
import { describe, expect, it } from "vitest";
import { disk, hexDist, keyOf, parseKey } from "@/lib/raid/zonegen/town/hex";
import type { TownInput } from "@/lib/raid/zonegen/town/types";
import {
  build,
  disc,
  FORM_CASES,
  hubRoads,
  roadAlongQ,
  roadReach,
  shuffled,
  skelInput,
  snapshot,
  TOWN,
  VILLAGE,
} from "@/test/townSkeletonFixture";

const built = FORM_CASES.map((c) => ({ ...c, sk: build(c.input, c.comp, c.n) }));
const ORIGIN = { q: 0, r: 0 };

describe("улицы не идут по воде и занятым", () => {
  it("вода и чужое: дорога их обходит, ворота всё равно связны", () => {
    const water = new Set(
      disc(14)
        .filter((c) => c.r === -3 && c.q < 4)
        .map(keyOf),
    );
    const occupied = new Set(["2,1", "-2,2", "1,-1", "-3,0", "4,-2"]);
    const sk = build(skelInput(disc(14), { seed: 5, water, occupied }), TOWN, 25);
    for (const k of sk.roads.keys()) expect(water.has(k) || occupied.has(k), k).toBe(false);
    const reach = roadReach(sk.roads, hubRoads(sk));
    for (const g of sk.gates) expect(reach.has(keyOf(g))).toBe(true);
  });

  it("центр от чужой постройки — не ближе 2 клеток", () => {
    const occupied = new Set(["0,0", "1,0", "0,1", "-1,0", "0,-1"]);
    const sk = build(skelInput(disc(14), { seed: 5, occupied }), TOWN, 25);
    for (const k of occupied) expect(hexDist(parseKey(k), sk.center)).toBeGreaterThanOrEqual(2);
  });

  it("центр, запертый декором, получает въезд прорезкой — но не через воду и чужое", () => {
    const wall = new Set(
      disk(ORIGIN, 2)
        .filter((c) => hexDist(c, ORIGIN) === 2)
        .map(keyOf),
    );
    const sk = build(skelInput(disc(4), { seed: 2, decorBlocked: wall }), VILLAGE, 10);
    expect(sk.gates.length).toBeGreaterThan(0);
    expect([...sk.roads.keys()].some((k) => wall.has(k))).toBe(true);
    const reach = roadReach(sk.roads, hubRoads(sk));
    for (const g of sk.gates) expect(reach.has(keyOf(g))).toBe(true);
  });

  it("в зоне без суши скелета нет", () => {
    const cells = disc(3);
    const water = new Set(cells.map(keyOf));
    expect(build.bind(null, skelInput(cells, { water }), TOWN, 25)).toThrow();
  });
});

describe("дорога карты используется (цена 0.2)", () => {
  it("уличная деревня: ось совпадает с дорогой карты, центр — на оси", () => {
    const b = built.find((x) => x.form === "street") as (typeof built)[number];
    const roads = b.input.mapRoads;
    const near = (k: string) => hexDist(parseKey(k), b.sk.center) <= b.sk.radius;
    for (const k of [...roads].filter(near)) expect(b.sk.roads.has(k), k).toBe(true);
    const main = [...b.sk.roads].filter(([k, rank]) => rank === 1 && near(k));
    for (const [k] of main) expect(roads.has(k), `${k} ушла с дороги карты`).toBe(true);
    expect(roads.has(keyOf(b.sk.center))).toBe(true);
  });

  it("городок на тракте: двое ворот на тракте, тракт внутри — часть сети", () => {
    const roads = roadAlongQ(1, -20, 20);
    const sk = build(skelInput(disc(14), { seed: 4, mapRoads: roads }), TOWN, 25);
    expect(sk.gates.filter((g) => roads.has(keyOf(g))).length).toBe(2);
    const inside = [...roads].filter((k) => hexDist(parseKey(k), sk.center) <= sk.radius);
    for (const k of inside) expect(sk.roads.has(k), k).toBe(true);
  });

  it("за воротами вынос тянется к дороге карты (≤ 6 клеток)", () => {
    // Тракт идёт в 7–8 клетках от середины: в круг Rb не заходит, но рядом.
    const roads = roadAlongQ(-8, -20, 20);
    const sk = build(skelInput(disc(12), { seed: 3, mapRoads: roads }), TOWN, 25);
    const reach = roadReach(sk.roads, hubRoads(sk));
    expect([...reach].some((k) => roads.has(k))).toBe(true);
  });
});

describe("детерминизм (шаг 0)", () => {
  it("тот же вход — тот же скелет байт в байт", () => {
    for (const b of built)
      expect(snapshot(build(b.input, b.comp, b.n)), b.form).toBe(snapshot(b.sk));
  });

  it("порядок клеток и множеств на входе не влияет", () => {
    for (const b of built) {
      const input: TownInput = {
        ...b.input,
        cells: shuffled(b.input.cells),
        water: new Set(shuffled([...b.input.water])),
        mapRoads: new Set(shuffled([...b.input.mapRoads])),
      };
      expect(snapshot(build(input, b.comp, b.n)), b.form).toBe(snapshot(b.sk));
    }
  });

  it("другой сид в той же области — другой скелет", () => {
    const town = built.find((b) => b.form === "town") as (typeof built)[number];
    const shots = new Set(
      [1, 2, 3, 4, 5, 6].map((seed) => snapshot(build({ ...town.input, seed }, TOWN, 25))),
    );
    expect(shots.size).toBeGreaterThan(1);
  });
});
