// Планировки поселений: `bun run test`.
//
// Проверяем не «красиво ли», а то, из-за чего владелец удалял постройки
// руками (24.09): дом обязан стоять у улицы, а не в поле; улицы — связны;
// на улице не строят; ратуша — в сердце города. И всё это повторяемо: тот же
// сид — тот же город, другой сид — другой, но такой же исправный.
import { describe, expect, it } from "vitest";
import { hexDistance } from "@/lib/raid/hex";
import { makeNoise, mulberry32 } from "@/lib/raid/zonegen/noise";
import type { ZoneCell } from "@/lib/raid/zonegen/recipe";
import { planSettlements } from "@/lib/raid/zonegen/settlement";
import { planLayout, type LayoutPlan } from "@/lib/raid/zonegen/settlement-layout";
import { HEX_DIRS } from "@/lib/raid/zonegen/settlement-place";
import type { SettlementLayout } from "@/lib/raid/zonegen/settlement-types";
import { HALL, houses, HUT, input, key, MINE } from "@/test/settlementFixture";

const ok = (cond: boolean, msg: string): void => {
  expect(cond, msg).toBe(true);
};

/** Планировки со скелетом; free проверяется старыми тестами про пятно. */
const PLANNED: SettlementLayout[] = ["ring", "cross", "grid"];
const ROAD = "r_dirt";
const AT: ZoneCell = { q: 0, r: 0 };

/** План в чистом поле: зона без края и без занятых клеток. */
const plan = (layout: SettlementLayout, seed = 11, size = 12): LayoutPlan =>
  planLayout({
    center: AT,
    size,
    layout,
    inZone: () => true,
    free: () => true,
    rnd: mulberry32(seed),
    noise: makeNoise(seed),
  });

const keys = (cells: ZoneCell[]): Set<string> => new Set(cells.map(key));

/** Связна ли фигура: обход в ширину от первой клетки по соседям. */
function connected(cells: ZoneCell[]): boolean {
  if (cells.length === 0) return true;
  const all = keys(cells);
  const seen = new Set<string>([key(cells[0])]);
  const queue: ZoneCell[] = [cells[0]];
  for (let i = 0; i < queue.length; i++) {
    const c = queue[i];
    for (const [dq, dr] of HEX_DIRS) {
      const n = { q: c.q + dq, r: c.r + dr };
      if (!all.has(key(n)) || seen.has(key(n))) continue;
      seen.add(key(n));
      queue.push(n);
    }
  }
  return seen.size === all.size;
}

/** Сколько участков стоит НЕ у улицы и не у площади — таких быть не должно. */
function offStreet(p: LayoutPlan): ZoneCell[] {
  const near = keys([...p.plaza, ...p.streets]);
  return p.lots.filter(
    (c) => !HEX_DIRS.some(([dq, dr]) => near.has(key({ q: c.q + dq, r: c.r + dr }))),
  );
}

describe("planLayout — скелет города", () => {
  it("улицы связны: по ним можно пройти от края до края", () => {
    for (const layout of PLANNED) {
      const p = plan(layout);
      ok(p.streets.length > 10, `${layout}: улиц почти нет (${p.streets.length})`);
      ok(connected(p.streets), `${layout}: улицы распались на куски`);
    }
  });

  it("каждый участок примыкает к улице или площади", () => {
    for (const layout of PLANNED) {
      const p = plan(layout);
      ok(p.lots.length > 10, `${layout}: участков почти нет (${p.lots.length})`);
      expect(offStreet(p).map(key), `${layout}: двор в чистом поле`).toEqual([]);
    }
  });

  it("участок никогда не совпадает с улицей или площадью", () => {
    for (const layout of PLANNED) {
      const p = plan(layout);
      const taken = keys([...p.streets, ...p.plaza]);
      for (const c of p.lots) ok(!taken.has(key(c)), `${layout}: участок на улице ${key(c)}`);
    }
  });

  it("участки идут от центра наружу: первый — ближайший", () => {
    for (const layout of PLANNED) {
      const away = plan(layout).lots.map((c) => hexDistance(AT.q, AT.r, c.q, c.r));
      for (let i = 1; i < away.length; i++)
        ok(away[i] >= away[i - 1], `${layout}: участки не по порядку близости`);
    }
  });

  it("у кольца сердце — площадь, у креста и кварталов — перекрёсток", () => {
    const ring = plan("ring");
    ok(
      ring.plaza.some((c) => c.q === AT.q && c.r === AT.r),
      "площадь без центра",
    );
    for (const layout of ["cross", "grid"] as SettlementLayout[]) {
      const p = plan(layout);
      // Площади нет: вырезать её из перекрёстка значит разрезать улицу надвое,
      // поэтому ратуша займёт ближний к центру участок — он рядом с центром.
      expect(p.plaza, `${layout}: завёл площадь на перекрёстке`).toEqual([]);
      const first = p.lots[0];
      ok(hexDistance(AT.q, AT.r, first.q, first.r) <= 1, `${layout}: ближний участок далеко`);
    }
  });

  it("хутор обходится без улиц, но участки у него есть", () => {
    const p = plan("ring", 11, 4);
    expect(p.streets).toEqual([]);
    ok(p.lots.length >= 6, `на хуторе негде строить: ${p.lots.length}`);
  });

  it("тот же сид — тот же план, другой сид — другой, но исправный", () => {
    for (const layout of PLANNED) expect(plan(layout, 5)).toEqual(plan(layout, 5));
    // Сиды подобраны так, чтобы попасть во все три скелета кольца: шесть спиц,
    // три спицы и те же три, повёрнутые на грань. Города не должны быть близнецами.
    const shapes = new Set<string>();
    for (const seed of [1000, 1001, 1005]) {
      const p = plan("ring", seed);
      shapes.add([...keys(p.streets)].sort().join("|"));
      ok(connected(p.streets), `сид ${seed}: улицы распались`);
      expect(offStreet(p).map(key), `сид ${seed}: двор в чистом поле`).toEqual([]);
    }
    expect(shapes.size, "жребий перестал крутить число спиц или поворот").toBe(3);
  });

  it("free — прежнее пятно: улиц в плане нет", () => {
    const p = plan("free");
    expect(p.streets).toEqual([]);
    expect(p.plaza).toEqual([AT]);
    ok(p.lots.length > 20, `пятно слишком мелкое: ${p.lots.length}`);
  });
});

describe("planSettlements — с планировкой", () => {
  const withLayout = (layout: SettlementLayout, over = {}) =>
    planSettlements(input({ layout, roadId: ROAD, size: 12, density: 0.25, ...over }));

  it("постройки не встают на улицы, улицы пишутся из плана", () => {
    for (const layout of PLANNED) {
      const { structures, report } = withLayout(layout);
      ok(report.buildings > 5, `${layout}: построек мало (${report.buildings})`);
      ok(report.roadCells > 5, `${layout}: улиц мало (${report.roadCells})`);
      for (const s of structures)
        ok(
          !(s.buildingId !== undefined && s.roadId !== undefined),
          `${layout}: дорога под двором ${key(s)}`,
        );
    }
  });

  it("ратуша одна и стоит в сердце города", () => {
    for (const layout of PLANNED) {
      const { structures } = withLayout(layout);
      const halls = houses(structures).filter((s) => s.buildingId === HALL.id);
      expect(halls.length, `${layout}: ратуш не одна`).toBe(1);
      const hall = halls[0];
      // Дома и улицы лежат в радиусе 6 от центра. Ратуша у центра — значит
      // дальше семи от неё ничего поселения не будет.
      for (const c of structures)
        ok(hexDistance(hall.q, hall.r, c.q, c.r) <= 7, `${layout}: ${key(c)} далеко от ратуши`);
    }
  });

  it("дома вдоль улицы стоят рядом, а на пятне — через клетку", () => {
    const touching = (layout: SettlementLayout): number => {
      const built = houses(withLayout(layout, { density: 0.3 }).structures);
      let n = 0;
      for (const a of built)
        for (const b of built) if (a !== b && hexDistance(a.q, a.r, b.q, b.r) === 1) n++;
      return n;
    };
    ok(touching("ring") > 0, "у кольца дома всё ещё стоят через клетку");
    expect(touching("free"), "на пятне дома слиплись").toBe(0);
  });

  it("под обязательные хватает участков при размере по умолчанию", () => {
    // Шесть обязательных — обычный набор владельца (ратуша, службы, дворы).
    const slots = [
      { buildingId: HALL.id, count: 1 },
      { buildingId: MINE.id, count: 3 },
      { buildingId: HUT.id, count: 2 },
    ];
    for (const layout of PLANNED) {
      const { report } = planSettlements(input({ layout, size: 7, slots }));
      expect(report.byBuilding[HALL.name], `${layout}: ратуши нет`).toBe(1);
      expect(report.buildings, `${layout}: встало не шесть`).toBe(6);
      expect(report.shortfall, `${layout}: недобор на ровном месте`).toBe(0);
    }
  });

  it("план повторяется клетка в клетку", () => {
    for (const layout of PLANNED) expect(withLayout(layout)).toEqual(withLayout(layout));
  });

  it("постройка стирает под собой декор", () => {
    const { structures } = withLayout("ring");
    for (const s of houses(structures)) expect(s.decorationId, key(s)).toBeNull();
  });
});
