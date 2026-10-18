// Объединённые блоки режима бога: связность, правка кэша, чтение блоков.
import { describe, expect, it } from "vitest";
import { MapStore } from "./mapStore";
import { gridOrigin } from "./hexGeometry";
import type { PackedCells } from "./unpackMap";
import { applyCellPatches, type MapLike } from "./patchMapCache";
import { readCellDetails } from "./cellDetails";
import { mergeCellPatch } from "./mergeCellPatch";
import { blocksOf, leadForTap } from "./mergeBlocks";
import { planBlocks } from "./drawMergedBlocks";
import { buildMapIndex } from "./mapIndex";
import { blockHasOtherLayer, isConnectedAxial, membersOfGroup, scaleOfGroup } from "./mergeSelect";
import { changedRows } from "./packedDelta";
import { packCells } from "@/server/api/beta-raid/packCells";

function synth(size: number): PackedCells {
  const q: number[] = [];
  const r: number[] = [];
  for (let rr = 0; rr < size; rr++)
    for (let qq = 0; qq < size; qq++) {
      q.push(qq);
      r.push(rr);
    }
  const n = q.length;
  return {
    terrainIds: ["grass"],
    roadIds: [],
    objectIds: ["mushroom"],
    decorationIds: [],
    buildingIds: ["mill"],
    q,
    r,
    t: new Array(n).fill(0),
    road: new Array(n).fill(-1),
    obj: new Array(n).fill(-1),
    dec: new Array(n).fill(-1),
    bld: new Array(n).fill(-1),
    defeated: [],
    runners: [],
    voidFog: [],
  };
}

const mapLike = (packed: PackedCells): MapLike =>
  ({ packed, terrains: {}, roads: {}, objects: {}, decorations: {}, buildings: {} }) as MapLike;

describe("isConnectedAxial", () => {
  it("линия и кольцо связаны, разрыв — нет", () => {
    expect(isConnectedAxial(["3,3", "4,3", "5,3"])).toBe(true);
    expect(isConnectedAxial(["3,3", "4,2", "4,3", "3,4"])).toBe(true);
    expect(isConnectedAxial(["3,3", "5,3"])).toBe(false);
    expect(isConnectedAxial([])).toBe(false);
  });
});

describe("applyCellPatches · блоки", () => {
  it("объединение, масштаб, разъединение — по тройкам и словарю", () => {
    const base = mapLike(synth(6));
    const merged = applyCellPatches(base, [
      { q: 1, r: 1, groupId: "g_a", iconScale: 1 },
      { q: 2, r: 1, groupId: "g_a", iconScale: 1 },
    ]);
    const p = merged!.packed!;
    expect(p.groupIds).toEqual(["g_a"]);
    expect(membersOfGroup(p, "g_a").sort()).toEqual(["1,1", "2,1"]);
    expect(scaleOfGroup(p, "g_a")).toBe(1);
    expect(readCellDetails(merged, 2, 1)).toMatchObject({ groupId: "g_a", iconScale: 1 });

    const scaled = applyCellPatches(merged, [
      { q: 1, r: 1, iconScale: 1.25 },
      { q: 2, r: 1, iconScale: 1.25 },
    ]);
    expect(scaleOfGroup(scaled!.packed!, "g_a")).toBe(1.25);
    // Масштаб на клетке ВНЕ блока ничего не меняет.
    const stray = applyCellPatches(scaled, [{ q: 4, r: 4, iconScale: 1.5 }]);
    expect(readCellDetails(stray, 4, 4).groupId).toBeNull();
    // Дельта колонок: тронуты ровно обе клетки блока.
    expect(changedRows(merged!.packed!, scaled!.packed!)?.sort()).toEqual([7, 8]);

    const split = applyCellPatches(scaled, [
      { q: 1, r: 1, groupId: null, iconScale: null },
      { q: 2, r: 1, groupId: null, iconScale: null },
    ]);
    expect(membersOfGroup(split!.packed!, "g_a")).toEqual([]);
    expect(readCellDetails(split, 1, 1).groupId).toBeNull();
  });

  it("объединил и разъединил — правка схлопывается в «как было»", () => {
    const start = readCellDetails(mapLike(synth(4)), 1, 1);
    const first = mergeCellPatch(undefined, { q: 1, r: 1, groupId: "g_x", iconScale: 1 }, start);
    expect(first?.groupId).toBe("g_x");
    const back = mergeCellPatch(first!, { q: 1, r: 1, groupId: null, iconScale: null }, start);
    expect(back).toBeNull();
  });
});

describe("blocksOf", () => {
  it("лид — первая клетка с постройкой; сирота блоком не считается; тап уходит лиду", () => {
    const packed = synth(6);
    packed.bld[2 * 6 + 3] = 0; // (3,2) — постройка
    packed.groupIds = ["g_a", "g_orphan"];
    // блок: (2,2),(3,2),(3,3); сирота: (5,5)
    packed.groups = [2 * 6 + 2, 0, 120, 2 * 6 + 3, 0, 120, 3 * 6 + 3, 0, 120, 5 * 6 + 5, 1, 100];
    const { centerQ, c0q } = gridOrigin(6);
    const store = new MapStore(packed, centerQ, c0q, false);
    const b = blocksOf(store);
    expect(b.list).toHaveLength(1);
    expect(b.list[0].lead).toBe(2 * 6 + 3);
    expect(b.list[0].scale).toBe(1.2);
    expect(b.groupOf[5 * 6 + 5]).toBe(-1);
    expect(leadForTap(store, 2, 2)).toEqual({ q: 3, r: 2 });
    expect(leadForTap(store, 3, 2)).toBeNull();
    // Герой стоит в этом же блоке — тап по другой его клетке — шаг (верфь → причал).
    expect(leadForTap(store, 2, 2, { q: 3, r: 2 })).toBeNull();
    expect(leadForTap(store, 2, 2, { q: 3, r: 3 })).toBeNull();
    // По своей клетке и издалека — по-прежнему окно постройки.
    expect(leadForTap(store, 2, 2, { q: 2, r: 2 })).toEqual({ q: 3, r: 2 });
    expect(leadForTap(store, 2, 2, { q: 0, r: 0 })).toEqual({ q: 3, r: 2 });
    expect(leadForTap(store, 2, 2, null)).toEqual({ q: 3, r: 2 });
    // Свой объект на члене — тап остаётся за клеткой.
    packed.obj[3 * 6 + 3] = 0;
    const store2 = new MapStore({ ...packed, obj: [...packed.obj] }, centerQ, c0q, false);
    expect(leadForTap(store2, 3, 3)).toBeNull();
  });
});

describe("сироты и вторая постройка", () => {
  it("блок из одной клетки не блок ни для карты, ни для окна клетки; постройка в блоке одна", () => {
    const packed = synth(6);
    packed.bld[2 * 6 + 3] = 0;
    packed.groupIds = ["g_a", "g_orphan"];
    packed.groups = [2 * 6 + 2, 0, 100, 2 * 6 + 3, 0, 100, 5 * 6 + 5, 1, 100];
    const map = mapLike(packed);
    expect(readCellDetails(map, 5, 5).groupId).toBeNull();
    expect(readCellDetails(map, 2, 2).groupId).toBe("g_a");
    expect(blockHasOtherLayer(map, 2, 2, "g_a", "buildingId")).toBe(true);
    expect(blockHasOtherLayer(map, 3, 2, "g_a", "buildingId")).toBe(false);
    expect(blockHasOtherLayer(map, 2, 2, "g_a", "decorationId")).toBe(false);
  });
});

describe("packCells · блоки", () => {
  it("numeric строкой из pg → тройки с процентами, масштаб в пределах", () => {
    const rows = [
      {
        q: 0,
        r: 0,
        terrain_id: "g",
        road_id: null,
        object_id: null,
        decoration_id: null,
        building_id: null,
        group_id: "g_1",
        icon_scale: "1.35",
      },
      {
        q: 1,
        r: 0,
        terrain_id: "g",
        road_id: null,
        object_id: null,
        decoration_id: null,
        building_id: null,
        group_id: "g_1",
        icon_scale: "9",
      },
      {
        q: 2,
        r: 0,
        terrain_id: "g",
        road_id: null,
        object_id: null,
        decoration_id: null,
        building_id: null,
        group_id: null,
        icon_scale: null,
      },
    ];
    const packed = packCells(
      rows,
      (x) => x,
      () => false,
    );
    expect(packed.groupIds).toEqual(["g_1"]);
    expect(packed.groups).toEqual([0, 0, 135, 1, 0, 200]);
  });
});

describe("planBlocks", () => {
  it("якорь — последний годный член в кадре; блок с клетками за кадром, но с картинкой в кадре — offscreen", () => {
    const packed = synth(8);
    packed.bld[3 * 8 + 3] = 0;
    packed.groupIds = ["g_a"];
    // блок: (3,3) лид, (4,3), (3,4)
    packed.groups = [3 * 8 + 3, 0, 100, 3 * 8 + 4, 0, 100, 4 * 8 + 3, 0, 100];
    const { centerQ, c0q } = gridOrigin(8);
    const store = new MapStore(packed, centerQ, c0q, false);
    const index = buildMapIndex(store);
    const blocks = blocksOf(store);
    const g = store.geom;
    const all = { minX: g.x0 - 100, maxX: g.x1 + 100, minY: g.y0 - 100, maxY: g.y1 + 100 };
    // Все годятся → якорь = (3,4), последняя по (r,q).
    expect([...planBlocks(blocks, index, all, () => true).anchors.keys()]).toEqual([4 * 8 + 3]);
    // Нижняя клетка под лагерем → якорь сдвигается на (4,3).
    const noLow = (i: number) => i !== 4 * 8 + 3;
    expect([...planBlocks(blocks, index, all, noLow).anchors.keys()]).toEqual([3 * 8 + 4]);
    // Ни один член не разведан — резервный якорь всё равно последний в кадре
    // (drawBlock сам отсечёт неразведанный блок), offscreen пуст.
    const none = planBlocks(blocks, index, all, () => false);
    expect([...none.anchors.keys()]).toEqual([4 * 8 + 3]);
    expect(none.offscreen).toEqual([]);
    // Кадр выше клеток блока, но картинка (до 2 ширин вверх) ещё в кадре.
    const b = blocks.list[0];
    const above = { minX: all.minX, maxX: all.maxX, minY: b.minY - 300, maxY: b.minY - 5 };
    const plan = planBlocks(blocks, index, above, () => true);
    expect(plan.anchors.size).toBe(0);
    expect(plan.offscreen).toEqual([b]);
    // Кадр далеко ниже — блока нет вовсе.
    const far = { minX: all.minX, maxX: all.maxX, minY: b.maxY + 100, maxY: b.maxY + 400 };
    expect(planBlocks(blocks, index, far, () => true).offscreen).toEqual([]);
  });
});
