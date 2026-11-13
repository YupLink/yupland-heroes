// «Поля подсвечиваются даже те, которые я не захватывал» (владелец 21.09):
// без плёнки — только своя шахта/поле (mineFlags 'own'), радиус 1. Чужие поля
// из fieldSlots и склады с моими вещами bright не дают.
import { describe, expect, it } from "vitest";
import { buildFogZones } from "./fogZones";

// Карта 100×100: номер клетки = q*100+r, вне диапазона — -1 (как mapStore.index).
const index = (q: number, r: number) => (q >= 0 && q < 100 && r >= 0 && r < 100 ? q * 100 + r : -1);
const at = (q: number, r: number) => index(q, r);

describe("buildFogZones.bright", () => {
  it("своя шахта даёт диск радиуса 1 (7 клеток)", () => {
    const { bright } = buildFogZones({
      index,
      heroQ: null,
      heroR: null,
      mineFlags: { "10,10": "own" },
    });
    expect(bright.size).toBe(7);
    expect(bright.has(at(10, 10))).toBe(true);
    expect(bright.has(at(11, 10))).toBe(true);
    expect(bright.has(at(10, 11))).toBe(true);
    expect(bright.has(at(12, 10))).toBe(false);
  });

  it("чужая шахта и дерево bright не дают", () => {
    const { bright } = buildFogZones({
      index,
      heroQ: null,
      heroR: null,
      mineFlags: { "10,10": "enemy", "20,20": "tree" },
    });
    expect(bright.size).toBe(0);
  });

  it("без mineFlags нет ни одной яркой клетки — поля/склады сюда не попадают", () => {
    // fieldSlots и warehouseBadges в аргументах нет намеренно: бейджи читаются
    // под плёнкой, а яркое кольцо делало соседей «захваченными».
    const { bright } = buildFogZones({ index, heroQ: 50, heroR: 50 });
    expect(bright.size).toBe(0);
  });

  it("клетки за краем карты (index = -1) не попадают в зону", () => {
    const { bright } = buildFogZones({
      index,
      heroQ: null,
      heroR: null,
      mineFlags: { "0,0": "own" },
    });
    for (const i of bright) expect(i).toBeGreaterThanOrEqual(0);
    expect(bright.size).toBe(3); // (0,0), (1,0), (0,1) — остальные соседи за краем
  });
});

describe("buildFogZones.active", () => {
  it("радиус 20 вокруг героя, без героя — пусто", () => {
    expect(buildFogZones({ index, heroQ: null, heroR: null }).active.has(at(50, 50))).toBe(false);
    const { active } = buildFogZones({ index, heroQ: 50, heroR: 50 });
    // Гекс-диск радиуса n: 3n²+3n+1 клеток.
    expect((active as Set<number>).size).toBe(3 * 20 * 20 + 3 * 20 + 1);
    expect(active.has(at(50, 50))).toBe(true);
    expect(active.has(at(71, 50))).toBe(false);
  });

  it("по карте (store) — те же клетки арифметикой, без списка", () => {
    const q: number[] = [];
    const r: number[] = [];
    for (let a = 0; a < 100; a++)
      for (let b = 0; b < 100; b++) {
        q.push(a);
        r.push(b);
      }
    const store = { index, packed: { q: Int16Array.from(q), r: Int16Array.from(r) } };
    for (const [hq, hr] of [
      [50, 50],
      [3, 97],
      [0, 0],
    ]) {
      const byList = buildFogZones({ index, heroQ: hq, heroR: hr }).active;
      const byMath = buildFogZones({ store, heroQ: hq, heroR: hr }).active;
      expect(byMath instanceof Set).toBe(false);
      for (let i = 0; i < 10000; i++) expect(byMath.has(i)).toBe(byList.has(i));
    }
    expect(buildFogZones({ store, heroQ: 50, heroR: 50 }).active.has(-1)).toBe(false);
    expect(buildFogZones({ store, heroQ: 50, heroR: 50 }).active.has(10000)).toBe(false);
    expect(buildFogZones({ store, heroQ: null, heroR: null }).active.has(at(50, 50))).toBe(false);
  });
});
