// Жила дельтой (CellPatch.vein): журнал сводит правки клетки, живой канал и
// журнал доезжают до кэша карты (applyLiveDelta / catchUp → applyCellPatches),
// список жил снимка меняется только там, где надо, кадр видит жилу (veinAt), а
// куски перепекаются только у этой клетки, без сброса всего слоя.
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./mapCache", () => ({ readCachedMap: vi.fn(), writeCachedMap: vi.fn() }));

import { applyVeinEdits, veinDiff, veinEditOf } from "./veinPatch";
import { applyCellPatches, type MapLike } from "./patchMapCache";
import { applyLiveDelta, catchUp } from "./useMapProgressive";
import { MapStore } from "./mapStore";
import { ChunkIndex, chunkId, chunkX, chunkY } from "./chunkIndex";
import { gridOrigin } from "./hexGeometry";
import { syncVeins, veinAt } from "./veinStore";
import { synthMap } from "@/test/mapFixture";
import { squashJournal } from "@/server/api/beta-raid/map-journal";
import { sanitizeDeltaForPlayer, type CellPatch } from "@/lib/raid/mapDelta";
import type { MapDataV } from "./mapBlob";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const cells = [
  { q: 0, r: 0 },
  { q: 1, r: 0 },
  { q: 2, r: 0 },
  { q: 5, r: 5 },
];
/** Карта с одной разложенной жилой: золото на (2,0), поворот 120°. */
const withVein = (): MapDataV => {
  const m = synthMap(cells);
  return { ...m, packed: { ...m.packed!, veins: [2, 1, 2] } };
};
const gold = (rot: number): CellPatch["vein"] => ({ kind: "gold", rot });

describe("правка жилы → тройка списка", () => {
  it("вид и поворот в номер; null — снять; мусор — мимо", () => {
    expect(veinEditOf({})).toBeUndefined();
    expect(veinEditOf({ vein: null })).toBeNull();
    expect(veinEditOf({ vein: { kind: "diamonds", rot: 300 } })).toEqual([2, 5]);
    expect(veinEditOf({ vein: gold(0) })).toEqual([1, 0]);
    expect(veinEditOf({ vein: gold(45) })).toBeUndefined();
    expect(veinEditOf({ vein: { kind: "stone" as "gold", rot: 0 } })).toBeUndefined();
  });

  it("новый список — только если состав сменился", () => {
    const list = [2, 1, 2];
    expect(applyVeinEdits(list, new Map())).toBeNull();
    expect(applyVeinEdits(list, new Map([[2, [1, 2] as const]]))).toBeNull();
    expect(applyVeinEdits(list, new Map([[7, null]]))).toBeNull();
    expect(applyVeinEdits(list, new Map([[0, [2, 4] as const]]))).toEqual([2, 1, 2, 0, 2, 4]);
    expect(applyVeinEdits(list, new Map([[2, null]]))).toEqual([]);
    // Старый кэш без списка: заводим его.
    expect(applyVeinEdits(undefined, new Map([[1, [1, 0] as const]]))).toEqual([1, 1, 0]);
  });

  it("разница двух списков — по клеткам", () => {
    expect(veinDiff([2, 1, 2], [2, 1, 2])).toEqual([]);
    expect(veinDiff([2, 1, 2], [2, 1, 2, 0, 2, 4]).sort()).toEqual([0]);
    expect(veinDiff([2, 1, 2], [2, 2, 2])).toEqual([2]);
    expect(veinDiff([2, 1, 2], undefined)).toEqual([2]);
  });
});

describe("applyCellPatches: жила из дельты", () => {
  it("ложится в список; колонки клеток — те же массивы; кадр её видит", () => {
    const old = withVein();
    const next = applyCellPatches(old, [{ q: 1, r: 0, vein: gold(60) }]) as MapDataV;
    expect(next.packed!.veins).toEqual([2, 1, 2, 1, 1, 1]);
    for (const col of ["q", "r", "t", "obj", "dec", "bld", "road"] as const)
      expect(next.packed![col]).toBe(old.packed![col]);
    syncVeins(next.packed!);
    expect(veinAt(1, 0)).toEqual({ kind: "gold", rot: 60 });
    expect(veinAt(2, 0)).toEqual({ kind: "gold", rot: 120 });
    expect(veinAt(0, 0)).toBeNull();
  });

  it("повтор той же правки — тот же список жил (нечего перепекать)", () => {
    const old = withVein();
    const next = applyCellPatches(old, [{ q: 2, r: 0, vein: gold(120) }]) as MapDataV;
    expect(next.packed!.veins).toBe(old.packed!.veins);
  });

  it("клетки нет на карте — призрак не заводится", () => {
    const old = withVein();
    const next = applyCellPatches(old, [{ q: 9, r: 9, vein: gold(0) }]) as MapDataV;
    expect(next.packed!.q).toHaveLength(cells.length);
    expect(next.packed!.veins).toEqual([2, 1, 2]);
  });

  it("земля и жила одной пачкой (журнал свёл клетку) — клетка заводится, жила на ней", () => {
    const old = withVein();
    const next = applyCellPatches(old, [
      { q: 7, r: 1, terrainId: "grass", vein: { kind: "diamonds", rot: 180 } },
    ]) as MapDataV;
    const i = next.packed!.q.length - 1;
    expect([next.packed!.q[i], next.packed!.r[i]]).toEqual([7, 1]);
    expect(next.packed!.veins).toEqual([2, 1, 2, i, 2, 3]);
  });
});

describe("журнал и живой канал везут жилу", () => {
  it("squashJournal сводит правки клетки: жила остаётся рядом с другими полями", () => {
    const rows = [
      { revision: 11, patch: { patches: [{ q: 1, r: 0, vein: gold(60) }] } },
      { revision: 12, patch: { patches: [{ q: 1, r: 0, objectId: "chest" }] } },
    ];
    const out = squashJournal(rows, 10, 12);
    expect(out).toMatchObject({
      rev: 12,
      patches: [{ q: 1, r: 0, vein: gold(60), objectId: "chest" }],
    });
  });

  it("под куполом игроку жила не уезжает", () => {
    const d = sanitizeDeltaForPlayer({
      rev: 3,
      patches: [{ q: 1, r: 0, voidFog: true, vein: gold(0) }],
    });
    expect(d.patches).toEqual([{ q: 1, r: 0, voidFog: true }]);
  });

  it("событие «map» подряд по версии — ложится без запроса журнала", async () => {
    const cur = withVein();
    globalThis.fetch = vi.fn() as unknown as typeof fetch;
    const merge = await applyLiveDelta(cur, {
      rev: cur.revision + 1,
      mapId: "rmap_t",
      patches: [{ q: 0, r: 0, vein: { kind: "diamonds", rot: 240 } }],
    });
    const next = merge(cur) as MapDataV;
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(next.revision).toBe(cur.revision + 1);
    expect(next.packed!.veins).toEqual([2, 1, 2, 0, 2, 4]);
  });

  it("вернулся с версией N — журнал дельтой, без перекачки карты", async () => {
    const cur = withVein();
    const delta = squashJournal(
      [{ revision: cur.revision + 1, patch: { patches: [{ q: 5, r: 5, vein: gold(300) }] } }],
      cur.revision,
      cur.revision + 1,
    );
    globalThis.fetch = vi.fn(
      async () => new Response(JSON.stringify({ ...delta, mapId: "rmap_t" }), { status: 200 }),
    ) as unknown as typeof fetch;
    const merge = await catchUp(cur);
    const next = merge(cur) as MapLike & MapDataV;
    expect(next.packed!.veins).toEqual([2, 1, 2, 3, 1, 5]);
    expect(next.revision).toBe(cur.revision + 1);
  });
});

describe("куски: перепечь только клетку новой жилы", () => {
  it("та же сетка, жилу положили — роняются куски клетки, без сброса", () => {
    const { centerQ, c0q } = gridOrigin(8);
    const a = new MapStore(withVein().packed!, centerQ, c0q, false);
    const next = applyCellPatches(withVein(), [{ q: 5, r: 5, vein: gold(0) }]) as MapDataV;
    const b = new MapStore({ ...a.packed, veins: next.packed!.veins }, centerQ, c0q, false);
    expect(b.geom).toBe(a.geom);
    const dropped: number[] = [];
    let cleared = 0;
    const idx = new ChunkIndex((cx, cy) => dropped.push(chunkId(cx, cy)));
    const seen = { hasIndex: () => true };
    idx.sync(a, seen, false, () => cleared++);
    cleared = 0;
    idx.sync(b, seen, false, () => cleared++);
    expect(cleared).toBe(0);
    const i = b.index(5, 5);
    expect(dropped).toContain(chunkId(chunkX(b.geom.x[i]), chunkY(b.geom.y[i])));
    // Повтор с тем же списком — тишина.
    dropped.length = 0;
    idx.sync(new MapStore({ ...b.packed }, centerQ, c0q, false), seen, false, () => cleared++);
    expect(dropped).toEqual([]);
    expect(cleared).toBe(0);
  });
});
