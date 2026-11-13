// Шаблон города острова: снять с острова → поставить на новый остров.
import { describe, expect, it } from "vitest";
import { generateIsland } from "@/lib/raid/island/generate";
import { hexDistance } from "@/lib/raid/hex";
import { keyOf } from "@/lib/raid/zonegen/town/hex";
import { TEST_CATALOG } from "@/test/worldSpec";
import { TEMPLATE_RADIUS, hasTownHall, pickTemplate, type TownTemplate } from "./townTemplate";
import { captureTemplate, nearestHall, taskCells, type MapLayers } from "./townTemplateCapture";
import { isWater, make, spec } from "./island.fixture";

const layers = (seed: number): MapLayers[] =>
  make(seed).cells.map((c) => ({
    q: c.q,
    r: c.r,
    t: c.terrainId,
    rd: c.roadId,
    d: c.decorationId,
    b: c.buildingId,
    gid: null,
    s: null,
  }));

/** Шаблон главного города острова seed — как его сняла бы ручка «Сохранить». */
function snap(seed: number): TownTemplate {
  const isl = make(seed);
  const halls = isl.halls.map((h) => ({ q: h.q, r: h.r }));
  const at = isl.places.hall ?? halls[0];
  const cells = captureTemplate(layers(seed), at, halls, taskCells(isl.places), isWater);
  return { id: `t${seed}`, name: "test", cells };
}

describe("captureTemplate", () => {
  it("смещения от ратуши, в круге, без клеток задания и без воды", () => {
    const isl = make(11);
    const tpl = snap(11);
    const skip = taskCells(isl.places);
    const at = isl.places.hall ?? isl.halls[0];
    expect(tpl.cells.some((c) => c.q === 0 && c.r === 0 && c.b !== null)).toBe(true);
    expect(hasTownHall(tpl, TEST_CATALOG)).toBe(true);
    for (const c of tpl.cells) {
      expect(hexDistance(0, 0, c.q, c.r)).toBeLessThanOrEqual(TEMPLATE_RADIUS);
      // Клетка задания — пустая: её место расчищено.
      if (skip.has(keyOf({ q: at.q + c.q, r: at.r + c.r })))
        expect([c.rd, c.d, c.b]).toEqual([null, null, null]);
      if (c.t !== null) expect(isWater(c.t)).toBe(false);
    }
  });

  it("клетка ближе к чужой ратуше — не наша", () => {
    const cells: MapLayers[] = [
      { q: 0, r: 0, t: "g", rd: null, d: null, b: "hall", gid: null, s: null },
      { q: 3, r: 0, t: "g", rd: null, d: "tree", b: null, gid: null, s: null },
      { q: 1, r: 0, t: "g", rd: "road", d: null, b: null, gid: null, s: null },
    ];
    const out = captureTemplate(
      cells,
      { q: 0, r: 0 },
      [
        { q: 0, r: 0 },
        { q: 4, r: 0 },
      ],
      new Set(),
      () => false,
    );
    expect(out.map((c) => c.q)).toEqual([0, 1]);
  });

  it("блоки — номерами, клетка задания — пустая, вода — мимо", () => {
    const cells: MapLayers[] = [
      { q: 0, r: 0, t: "g", rd: null, d: null, b: "hall", gid: "abc", s: 150 },
      { q: 1, r: 0, t: "g", rd: null, d: null, b: null, gid: "abc", s: 150 },
      { q: 0, r: 1, t: "g", rd: null, d: null, b: "house", gid: "zzz", s: 120 },
      { q: 2, r: 0, t: "g", rd: "road", d: "tree", b: "shop", gid: null, s: null },
      { q: 3, r: 0, t: "sea", rd: null, d: null, b: null, gid: null, s: null },
    ];
    const out = captureTemplate(
      cells,
      { q: 0, r: 0 },
      [{ q: 0, r: 0 }],
      new Set(["2,0"]),
      (id) => id === "sea",
    );
    expect(out).toEqual([
      { q: 0, r: 0, t: "g", rd: null, d: null, b: "hall", g: 0, s: 150 },
      { q: 1, r: 0, t: "g", rd: null, d: null, b: null, g: 0, s: 150 },
      { q: 0, r: 1, t: "g", rd: null, d: null, b: "house", g: 1, s: 120 },
      { q: 2, r: 0, t: "g", rd: null, d: null, b: null },
    ]);
  });

  it("ратуша — ближайшая к тапу в трёх клетках", () => {
    const halls = [
      { q: 0, r: 0 },
      { q: 10, r: 0 },
    ];
    expect(nearestHall(halls, { q: 9, r: 1 })).toEqual({ q: 10, r: 0 });
    expect(nearestHall(halls, { q: 5, r: 0 })).toBeNull();
  });
});

describe("generateIsland по шаблону", () => {
  const tpl = snap(11);
  const isl = generateIsland(spec, TEST_CATALOG, 222, undefined, [tpl]);
  const byKey = new Map(isl.cells.map((c) => [keyOf(c), c]));

  it("ратуша главного города стоит, постройки шаблона — на своих местах", () => {
    const hall = isl.places.hall;
    expect(hall).not.toBeNull();
    if (!hall) return;
    let same = 0;
    let total = 0;
    for (const c of tpl.cells) {
      if (c.b === null) continue;
      total += 1;
      if (byKey.get(keyOf({ q: hall.q + c.q, r: hall.r + c.r }))?.buildingId === c.b) same += 1;
    }
    // Клетки задания (мастерская, шахты) могут лечь поверх — почти все на месте.
    expect(same).toBeGreaterThanOrEqual(Math.ceil(total * 0.8));
  });

  it("блок шаблона — блоком на острове, задание на него не встаёт", () => {
    const hallCell = tpl.cells.find((c) => c.q === 0 && c.r === 0);
    const side = tpl.cells.find((c) => c.b === null && hexDistance(0, 0, c.q, c.r) === 1);
    expect(hallCell && side).toBeTruthy();
    const blocky: TownTemplate = {
      ...tpl,
      cells: tpl.cells.map((c) => (c === hallCell || c === side ? { ...c, g: 0, s: 150 } : c)),
    };
    const b = generateIsland(spec, TEST_CATALOG, 222, undefined, [blocky]);
    const hall = b.places.hall;
    if (!hall || !side) return;
    const at = (dq: number, dr: number) =>
      b.cells.find((c) => c.q === hall.q + dq && c.r === hall.r + dr);
    const g = at(0, 0)?.groupId;
    expect(g).toBeTruthy();
    expect(at(side.q, side.r)?.groupId).toBe(g);
    expect(at(side.q, side.r)?.iconScale).toBe(150);
    const sideKey = keyOf({ q: hall.q + side.q, r: hall.r + side.r });
    const used = [
      b.places.spawn,
      b.places.chest,
      b.places.workshop,
      b.places.portal,
      ...b.places.monsters,
    ];
    expect(used.some((c) => keyOf(c) === sideKey)).toBe(false);
  });

  it("на каждом городе — шаблон (у всех трёх ратуша)", () => {
    expect(isl.halls.length).toBe(make(222).halls.length);
  });

  it("без шаблона ратуши — выращенный город, как раньше", () => {
    const bad: TownTemplate = { id: "x", name: "x", cells: tpl.cells.filter((c) => c.b === null) };
    const plain = generateIsland(spec, TEST_CATALOG, 222, undefined, [bad]);
    expect(plain.cells).toEqual(make(222).cells);
  });

  it("выбор шаблона — по сиду места, детерминирован", () => {
    const list = [tpl, { ...tpl, id: "b" }, { ...tpl, id: "c" }];
    expect(pickTemplate(list, 42)).toBe(pickTemplate(list, 42));
    expect(pickTemplate([], 42)).toBeNull();
  });
});
