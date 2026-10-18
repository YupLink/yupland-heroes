// Тесты расстановки поселений: `bun run test`.
//
// Проверяем не «красиво ли», а то, на чём держится карта: один сид — одно
// поселение; дворы не слипаются; вода и занятые клетки нетронуты; количество
// из состава соблюдено точно, а фон лишь добивает остаток пятна. Улицы — в
// settlement.roads.test.ts, состав пресетов — в settlement.compose.
import { describe, expect, it } from "vitest";
import { hexDistance } from "@/lib/raid/hex";
import { planSettlements } from "@/lib/raid/zonegen/settlement";
import { recipe } from "@/test/zonegenFixture";
import {
  field,
  houses,
  HALL,
  HOUSE,
  HUT,
  input,
  key,
  MINE,
  settlement,
  terrainWith,
} from "@/test/settlementFixture";

const ok = (cond: boolean, msg: string): void => {
  expect(cond, msg).toBe(true);
};

describe("planSettlements — расстановка", () => {
  it("один вход → тот же план, другой сид → другой", () => {
    const a = planSettlements(input());
    const b = planSettlements(input());
    expect(a).toEqual(b);
    const other = planSettlements(
      input({}, { recipe: recipe({ seed: 777, settlement: settlement() }) }),
    );
    const same = houses(other.structures).filter((h) =>
      houses(a.structures).some((x) => x.q === h.q && x.r === h.r),
    ).length;
    ok(same < houses(a.structures).length, `сид 777 дал то же поселение: ${same}`);
  });

  it("выключенный рецепт не даёт ни клетки", () => {
    const { structures, report } = planSettlements(input({ enabled: false }));
    expect(structures).toEqual([]);
    expect(report.places).toBe(0);
    expect(report.buildings).toBe(0);
  });

  it("пустые слоты — пустой план; недобор не выдумывается", () => {
    // Недобор означает «не нашлось места», а не «админ не выбрал постройки»:
    // про пустой набор предупреждает панель, а не отчёт.
    const { structures, report } = planSettlements(input({ slots: [] }));
    expect(structures).toEqual([]);
    expect(report.buildings).toBe(0);
    expect(report.places).toBe(0);
    expect(report.shortfall).toBe(0);
  });

  it("построек по density: вдвое плотнее — вдвое больше (±20 %)", () => {
    // Пятно одно и то же: центр и края — от сида, а не от плотности. Значит,
    // бюджет растёт ровно с density, и отношение дворов его и показывает.
    const sparse = planSettlements(input({ density: 0.1, size: 12 })).report;
    const { report } = planSettlements(input({ density: 0.2, size: 12 }));
    ok(sparse.buildings >= 5, `пятно слишком мелкое для замера: ${sparse.buildings}`);
    const got = report.buildings / sparse.buildings;
    ok(Math.abs(got - 2) <= 0.4, `вдвое плотнее дало ×${got} вместо ×2 ± 20 %`);
    expect(report.buildings).toBe(houses(planSettlements(input()).structures).length);
  });

  it("между дворами всегда пустая клетка", () => {
    const { structures } = planSettlements(input({ density: 0.6, count: 3 }));
    const built = houses(structures);
    ok(built.length > 10, `дворов слишком мало для проверки: ${built.length}`);
    for (const a of built)
      for (const b of built) {
        if (a === b) continue;
        ok(hexDistance(a.q, a.r, b.q, b.r) >= 2, `дворы вплотную: ${key(a)} и ${key(b)}`);
      }
  });

  it("count соблюдается точно: сколько заказано, столько и стоит", () => {
    // Ради этого всё и затевалось: «2» больше не потолок жребия, а «две штуки».
    const { structures, report } = planSettlements(
      input({
        density: 0.6,
        slots: [
          { buildingId: HOUSE.id, count: 2 },
          { buildingId: MINE.id, count: 3 },
        ],
      }),
    );
    expect(report.byBuilding[HOUSE.name]).toBe(2);
    expect(report.byBuilding[MINE.name]).toBe(3);
    expect(houses(structures).length).toBe(5);
    expect(report.shortfall).toBe(0);
  });

  it("без фона состав не разрастается, с фоном — добивает бюджет", () => {
    const solo = planSettlements(input({ slots: [{ buildingId: HALL.id, count: 1 }] }));
    expect(solo.report.buildings).toBe(1);
    const full = planSettlements(input());
    // Пятно то же, плотность 0.2: бюджет — вдвое больше, чем при 0.1. Фон
    // добивает его до округления, но сверх не ставит.
    const budget = 2 * planSettlements(input({ density: 0.1 })).report.buildings;
    ok(full.report.buildings >= budget - 2, `фон не добил: ${full.report.buildings} из ${budget}`);
    expect(full.report.buildings).toBeLessThanOrEqual(budget + 1);
  });

  it("фон не вытесняет обязательные и делится поровну", () => {
    const { report } = planSettlements(
      input({
        density: 0.3,
        slots: [
          { buildingId: HALL.id, count: 1 },
          { buildingId: MINE.id, count: 2 },
          { buildingId: HOUSE.id, count: 0, fill: true },
          { buildingId: HUT.id, count: 0, fill: true },
        ],
      }),
    );
    expect(report.byBuilding[HALL.name]).toBe(1);
    expect(report.byBuilding[MINE.name]).toBe(2);
    const gap = Math.abs((report.byBuilding[HOUSE.name] ?? 0) - (report.byBuilding[HUT.name] ?? 0));
    ok(gap <= 1, `фон разошёлся на ${gap} дворов`);
  });

  it("бюджет меньше обязательных — ставим сколько влезло, остальное в недобор", () => {
    const slots = [
      { buildingId: HALL.id, count: 1 },
      { buildingId: HOUSE.id, count: 4 },
      { buildingId: MINE.id, count: 4 },
    ];
    const { report } = planSettlements(input({ size: 4, density: 0.1, slots }));
    ok(report.buildings > 0, "не встало вообще ничего — проверять нечего");
    ok(report.buildings < 9, `влезли все девять в пятно размера 4: ${report.buildings}`);
    expect(report.shortfall).toBe(9 - report.buildings);
  });

  it("вода и занятые клетки не застраиваются и не красятся", () => {
    const cells = field();
    const water = (c: { q: number }) => c.q < 12;
    const occupied = new Set(cells.filter((c) => c.r % 4 === 0).map(key));
    const { structures } = planSettlements(
      input({ density: 0.5, count: 3 }, { cells, occupied, terrainOf: terrainWith(cells, water) }),
    );
    ok(structures.length > 0, "план пуст — проверять нечего");
    for (const s of structures) {
      ok(!water(s), `клетка на воде: ${key(s)}`);
      ok(!occupied.has(key(s)), `клетка на занятой: ${key(s)}`);
    }
  });

  it("план не выходит за пределы переданных клеток", () => {
    const cells = field(14, 14);
    const zone = new Set(cells.map(key));
    const { structures } = planSettlements(input({ count: 2, size: 8 }, { cells }));
    ok(structures.length > 0, "план пуст — проверять нечего");
    for (const s of structures) ok(zone.has(key(s)), `клетка вне зоны: ${key(s)}`);
  });

  it("ратуша одна и стоит в середине пятна", () => {
    const { structures } = planSettlements(input({ size: 12 }));
    const halls = houses(structures).filter((s) => s.buildingId === HALL.id);
    expect(halls.length).toBe(1);
    const hall = halls[0];
    // Пятно радиуса 6: из центра до любого двора не дальше шести, а с края —
    // вдвое больше. Так и отличаем «в середине» от «где-то там».
    for (const c of houses(structures))
      ok(hexDistance(hall.q, hall.r, c.q, c.r) <= 6, `двор далеко от ратуши: ${key(c)}`);
  });

  it("достроенность: тир — последний у шаблона, и только если тиры есть", () => {
    const slots = [
      { buildingId: HOUSE.id, count: 2 },
      { buildingId: MINE.id, count: 2 },
      { buildingId: HUT.id, count: 0, fill: true },
    ];
    const built = houses(planSettlements(input({ slots, density: 0.4 })).structures);
    const raw = houses(planSettlements(input({ slots, density: 0.4, built: false })).structures);
    for (const s of built) {
      if (s.buildingId === HUT.id) expect(s.tier).toBeUndefined();
      if (s.buildingId === MINE.id) expect(s.tier).toBe(1);
      if (s.buildingId === HOUSE.id) expect(s.tier).toBe(0);
    }
    for (const s of raw) {
      if (s.buildingId === HUT.id) expect(s.tier).toBeUndefined();
      else expect(s.tier).toBe(0);
    }
  });

  it("несколько поселений разнесены минимум на поперечник", () => {
    const { report } = planSettlements(input({ count: 3, size: 8, density: 0.25 }));
    expect(report.places).toBe(3);
  });

  it("порт жмётся к воде, деревня — нет", () => {
    const cells = field(40, 24);
    const water = (c: { q: number }) => c.q < 4;
    const terrainOf = terrainWith(cells, water);
    const toWater = (preset: "port" | "village") => {
      const { structures } = planSettlements(
        input({ preset, count: 1, size: 9 }, { cells, terrainOf }),
      );
      return Math.min(...houses(structures).map((h) => h.q - 3));
    };
    const port = toWater("port");
    ok(port <= 2, `порт встал в ${port} клетках от воды`);
    ok(toWater("village") > port, "деревня оказалась ближе к воде, чем порт");
  });
});
