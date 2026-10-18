// Улицы поселения: `bun run test`.
//
// Улица не украшение: по ней ходят герои, поэтому дворы обязаны быть связаны
// между собой, а под домом дороги быть не должно — запись затёрла бы дом.
import { describe, expect, it } from "vitest";
import { HEX_DIRS } from "@/lib/raid/zonegen/settlement-place";
import { planSettlements } from "@/lib/raid/zonegen/settlement";
import type { ZoneStructure } from "@/lib/raid/zonegen/settlement-types";
import {
  field,
  HALL,
  houses,
  HOUSE,
  input,
  key,
  settlement,
  streets,
} from "@/test/settlementFixture";

const ok = (cond: boolean, msg: string): void => {
  expect(cond, msg).toBe(true);
};

const ROAD = "r_dirt";

/** Связны ли дворы: обход в ширину по клеткам «дом или дорога». */
function reachable(structures: ZoneStructure[]): number {
  const built = houses(structures);
  const walk = new Set([...built, ...streets(structures)].map(key));
  const seen = new Set<string>([key(built[0])]);
  const queue = [built[0]];
  for (let i = 0; i < queue.length; i++) {
    const c = queue[i];
    for (const [dq, dr] of HEX_DIRS) {
      const n = { q: c.q + dq, r: c.r + dr };
      const k = key(n);
      if (!walk.has(k) || seen.has(k)) continue;
      seen.add(k);
      queue.push(n);
    }
  }
  return built.filter((b) => seen.has(key(b))).length;
}

describe("planSettlements — улицы", () => {
  it("дорога связывает все дворы поселения", () => {
    const { structures, report } = planSettlements(
      input({ roadId: ROAD, density: 0.25, size: 13, count: 1 }),
    );
    const built = houses(structures);
    ok(built.length >= 8, `дворов мало для проверки: ${built.length}`);
    ok(report.roadCells > 0, "улиц не проложили вовсе");
    expect(reachable(structures)).toBe(built.length);
  });

  it("под двором дороги нет, отчёт считает клетки улиц", () => {
    const { structures, report } = planSettlements(input({ roadId: ROAD, density: 0.25 }));
    for (const s of structures)
      ok(!(s.buildingId !== undefined && s.roadId !== undefined), `дорога под двором: ${key(s)}`);
    expect(streets(structures).length).toBe(report.roadCells);
  });

  it("roadId null — ни одной клетки дороги", () => {
    const { structures, report } = planSettlements(input({ roadId: null, density: 0.3 }));
    expect(streets(structures)).toEqual([]);
    expect(report.roadCells).toBe(0);
    ok(houses(structures).length > 0, "дворов нет — проверять нечего");
  });

  it("дорога зоны не перекладывается, а используется как есть", () => {
    const cells = field();
    // Тракт через всю зону: дворы на него не встают, и поверх него не пишем.
    const roads = new Set(cells.filter((c) => c.r === 15).map(key));
    const { structures } = planSettlements(
      input({ roadId: ROAD, density: 0.3, size: 13 }, { cells, roads }),
    );
    for (const s of structures) ok(!roads.has(key(s)), `тронули существующую дорогу: ${key(s)}`);
    expect(reachable(structures)).toBe(houses(structures).length);
  });

  it("один двор — улиц не строим", () => {
    const { report } = planSettlements(
      input({ roadId: ROAD, size: 4, density: 0.05, slots: [{ buildingId: HOUSE.id, count: 1 }] }),
    );
    expect(report.buildings).toBeLessThanOrEqual(1);
    expect(report.roadCells).toBe(0);
  });
});

describe("planSettlements — повтор и границы", () => {
  it("ратуша без дороги — правки только под домами, вокруг ничего не красим", () => {
    const { structures } = planSettlements(input());
    ok(
      houses(structures).some((s) => s.buildingId === HALL.id),
      "ратуши нет — проверять нечего",
    );
    expect(structures.length).toBe(houses(structures).length);
  });

  it("план повторяется: те же дома и те же улицы", () => {
    const one = planSettlements(input({ roadId: ROAD, density: 0.3, count: 2, size: 10 }));
    const two = planSettlements(input({ roadId: ROAD, density: 0.3, count: 2, size: 10 }));
    expect(one).toEqual(two);
    expect(one.structures.length).toBeLessThanOrEqual(8000);
  });

  it("рецепт поселений не трогает клетки за пределами зоны", () => {
    const cells = field(16, 16);
    const zone = new Set(cells.map(key));
    const { structures } = planSettlements(
      input({ roadId: ROAD, size: 12, density: 0.3 }, { cells }),
    );
    for (const s of structures) ok(zone.has(key(s)), `клетка вне зоны: ${key(s)}`);
    expect(planSettlements(input({ roadId: ROAD }, { cells })).report.places).toBeLessThanOrEqual(
      settlement().count,
    );
  });
});
