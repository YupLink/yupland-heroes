// Режим бога по блоку клеток (владелец, 05.10.2026: «не удаляется и не
// меняется»): правка постройки/декора по ЛЮБОЙ клетке блока идёт туда, где
// этот слой стоит, а окно клетки по соседке открывается у постройки блока.
import { describe, expect, it } from "vitest";
import type { PackedCells } from "./unpackMap";
import {
  blockInspectCell,
  blockLayerHolder,
  routeBlockPatch,
  stripBlockedLayers,
} from "./mergeSelect";
import { mergeCellPatch } from "./mergeCellPatch";
import { readCellDetails, type MapLike } from "./patchMapCache";

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
    buildingIds: ["town_hall"],
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

/** Блок из двух клеток, как ратуша на (48,24)+(48,25): постройка на верхней. */
function townBlock() {
  const p = synth(6);
  p.bld[2 * 6 + 3] = 0; // (3,2) — ведущая, с постройкой
  p.groupIds = ["g_town"];
  p.groups = [2 * 6 + 3, 0, 145, 3 * 6 + 3, 0, 145]; // (3,2) и (3,3)
  return mapLike(p);
}

describe("правка по блоку клеток", () => {
  it("постройка блока — на ведущей клетке", () => {
    expect(blockLayerHolder(townBlock(), "g_town", "buildingId")).toEqual({ q: 3, r: 2 });
    expect(blockLayerHolder(townBlock(), "g_town", "decorationId")).toBeNull();
  });

  it("убрать постройку тапом по соседке — убирается на ведущей", () => {
    expect(routeBlockPatch(townBlock(), "g_town", { q: 3, r: 3, buildingId: null })).toEqual([
      { q: 3, r: 2, buildingId: null },
    ]);
  });

  it("сменить постройку и облик по соседке — меняются на ведущей, местность остаётся своей", () => {
    expect(
      routeBlockPatch(townBlock(), "g_town", {
        q: 3,
        r: 3,
        buildingId: "tavern",
        buildingSkinId: "bskin_x",
        terrainId: "snow",
      }),
    ).toEqual([
      { q: 3, r: 2, buildingId: "tavern", buildingSkinId: "bskin_x" },
      { q: 3, r: 3, terrainId: "snow" },
    ]);
  });

  it("правка самой ведущей и вне блока — как была", () => {
    expect(routeBlockPatch(townBlock(), "g_town", { q: 3, r: 2, tier: 2 })).toEqual([
      { q: 3, r: 2, tier: 2 },
    ]);
    expect(routeBlockPatch(townBlock(), null, { q: 1, r: 1, buildingId: "x" })).toEqual([
      { q: 1, r: 1, buildingId: "x" },
    ]);
  });

  it("окно клетки по соседке открывается у постройки блока; свой объект — у себя", () => {
    const map = townBlock();
    expect(blockInspectCell(map, 3, 3)).toEqual({ q: 3, r: 2 });
    expect(blockInspectCell(map, 3, 2)).toEqual({ q: 3, r: 2 });
    expect(blockInspectCell(map, 0, 0)).toEqual({ q: 0, r: 0 });
    map!.packed!.obj[3 * 6 + 3] = 0;
    expect(blockInspectCell(map, 3, 3)).toEqual({ q: 3, r: 3 });
  });
});

// «Призрак» — облик постройки на клетке без постройки: карта его рисует, игрок
// не открывает, «убрать» не брал (владелец, 05.10.2026: табличка «Город -
// Вихоток»). Очередь не должна собирать такую правку ни одним путём.
describe("облик без постройки в очередь не попадает", () => {
  it("генератор по члену блока: снятая постройка уносит свой облик, тир и настройки", () => {
    expect(
      stripBlockedLayers(townBlock(), "g_town", {
        q: 3,
        r: 3,
        buildingId: "tavern",
        buildingSkinId: "bskin_x",
        tier: 1,
        terrainId: "snow",
      }),
    ).toEqual({
      q: 3,
      r: 3,
      buildingId: undefined,
      buildingSkinId: undefined,
      tier: undefined,
      buildingConfig: undefined,
      terrainId: "snow",
    });
    expect(
      stripBlockedLayers(townBlock(), "g_town", {
        q: 3,
        r: 3,
        buildingId: "x",
        buildingSkinId: "s",
      }),
    ).toBeNull();
  });

  it("выбрал облик и убрал постройку до выгрузки — облик уходит вместе с ней", () => {
    const map = townBlock();
    const start = readCellDetails(map, 3, 2);
    const skin = mergeCellPatch(undefined, { q: 3, r: 2, buildingSkinId: "bskin_x" }, start);
    const gone = mergeCellPatch(skin!, { q: 3, r: 2, buildingId: null }, start);
    expect(gone).toEqual({ q: 3, r: 2, buildingId: null });
  });

  it("«база» и смена облика с постройкой — облик остаётся в правке", () => {
    const start = readCellDetails(townBlock(), 3, 2);
    expect(
      mergeCellPatch(
        undefined,
        { q: 3, r: 2, buildingId: "town_hall", buildingSkinId: null },
        start,
      ),
    ).toEqual({ q: 3, r: 2, buildingId: "town_hall", buildingSkinId: null });
  });
});
