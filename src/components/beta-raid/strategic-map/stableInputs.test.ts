// Окно «Карта» не пересобирает ландшафт на каждое событие живой карты:
// правка объекта даёт новые колонки, но те же колонки местности — отпечаток
// тот же; смена местности или новая клетка — отпечаток другой.
import { describe, expect, it } from "vitest";
import { MapStore } from "../mapStore";
import { FogMask, fogView } from "../fogMask";
import { gridOrigin } from "../hexGeometry";
import { applyCellPatches, type MapLike } from "../patchMapCache";
import type { PackedCells } from "../unpackMap";
import { keySetStamp, landscapeStamp, sameStamp, terrainLookup } from "./stableInputs";
import { fitCells, seenCells } from "./terrainGeometry";

const SIZE = 6;
const { centerQ, c0q } = gridOrigin(SIZE);

function synth(): PackedCells {
  const q: number[] = [];
  const r: number[] = [];
  for (let rr = 0; rr < SIZE; rr++)
    for (let qq = 0; qq < SIZE; qq++) {
      q.push(qq);
      r.push(rr);
    }
  const n = q.length;
  return {
    terrainIds: ["grass", "sand"],
    roadIds: [],
    objectIds: ["wolf"],
    decorationIds: [],
    buildingIds: [],
    q,
    r,
    t: q.map((v) => v % 2),
    road: new Array<number>(n).fill(-1),
    obj: new Array<number>(n).fill(-1),
    dec: new Array<number>(n).fill(-1),
    bld: new Array<number>(n).fill(-1),
    defeated: [],
    runners: [],
    voidFog: [],
  };
}

const terrains = { grass: { imageUrl: "/g.png" }, sand: { imageUrl: "/s.png" } };
const landscapeOf = (packed: PackedCells) => ({
  cells: new MapStore(packed, centerQ, c0q, false).cells,
  terrains,
});
const patch = (packed: PackedCells, p: Parameters<typeof applyCellPatches>[1]) =>
  (applyCellPatches({ packed } as MapLike, p) as { packed: PackedCells }).packed;

describe("landscapeStamp", () => {
  it("an object event keeps the terrain stamp: no atlas rebuild", () => {
    const a = synth();
    const b = patch(a, [{ q: 1, r: 1, objectId: "wolf", alive: true }]);
    expect(b).not.toBe(a);
    expect(sameStamp(landscapeStamp(landscapeOf(a)), landscapeStamp(landscapeOf(b)))).toBe(true);
  });
  it("a terrain change or a new dictionary changes the stamp", () => {
    const a = synth();
    const b = patch(a, [{ q: 1, r: 1, terrainId: "sand" }]);
    expect(sameStamp(landscapeStamp(landscapeOf(a)), landscapeStamp(landscapeOf(b)))).toBe(false);
    const l = landscapeOf(a);
    expect(sameStamp(landscapeStamp(l), landscapeStamp({ ...l, terrains: { ...terrains } }))).toBe(
      false,
    );
  });
  it("plain dictionaries (detailed tab) compare by reference", () => {
    const plain = { cells: { "0,0": { terrainId: "grass" } }, terrains };
    expect(sameStamp(landscapeStamp(plain), landscapeStamp(plain))).toBe(true);
    expect(sameStamp(landscapeStamp(plain), landscapeStamp({ ...plain }))).toBe(false);
  });
});

describe("terrainLookup", () => {
  it("reads the terrain column directly, same answer as the cell dictionary", () => {
    const l = landscapeOf(synth());
    const look = terrainLookup(l);
    for (const key of ["0,0", "1,0", "5,5", "9,9"]) expect(look(key)).toBe(l.cells[key]?.terrainId);
    expect(terrainLookup({ cells: { "2,3": { terrainId: "sand" } }, terrains })("2,3")).toBe(
      "sand",
    );
    expect(terrainLookup(undefined)("0,0")).toBeUndefined();
  });
});

describe("keySetStamp", () => {
  it("a new fog snapshot of the same mask and version is the same set", () => {
    const store = new MapStore(synth(), centerQ, c0q, false);
    const mask = new FogMask(store);
    mask.addDisc(2, 2, 1);
    const a = fogView(mask);
    expect(sameStamp(keySetStamp(a), keySetStamp(fogView(mask)))).toBe(true);
    mask.addDisc(4, 4, 1);
    mask.version++;
    expect(sameStamp(keySetStamp(a), keySetStamp(fogView(mask)))).toBe(false);
    const set = new Set(["1,1"]);
    expect(sameStamp(keySetStamp(set), keySetStamp(new Set(set)))).toBe(false);
  });
});

describe("seenCells", () => {
  it("the fog-bits fast path gives the same cells as parsing keys", () => {
    const store = new MapStore(synth(), centerQ, c0q, false);
    const mask = new FogMask(store);
    mask.addDisc(2, 3, 2);
    const fast = seenCells(fogView(mask), centerQ, c0q);
    const slow = seenCells(new Set(mask.toKeys()), centerQ, c0q);
    expect(fast.map((c) => c.key)).toEqual(slow.map((c) => c.key));
    fast.forEach((c, i) => {
      expect(c.x).toBeCloseTo(slow[i].x, 3);
      expect(c.y).toBeCloseTo(slow[i].y, 3);
    });
    expect(fast.length).toBe(mask.size);
  });
});

describe("fitCells", () => {
  it("the picture frame ignores markers; the view frame includes them", () => {
    const cells = seenCells(new Set(["1,1", "2,1", "1,2"]), centerQ, c0q);
    const atlas = fitCells(cells, []);
    const view = fitCells(cells, [{ x: 2000, y: 2000 }]);
    expect(view.scale).toBeLessThan(atlas.scale);
    // A cell lands on the same view point through the picture transform used by the layer.
    const k = view.scale / atlas.scale;
    const cell = cells[0];
    const pa = atlas.fit(cell);
    const viaAtlas = {
      x: 160 - 160 * k + (atlas.cx - view.cx) * view.scale + pa.x * k,
      y: 160 - 160 * k + (atlas.cy - view.cy) * view.scale + pa.y * k,
    };
    const direct = view.fit(cell);
    expect(viaAtlas.x).toBeCloseTo(direct.x, 6);
    expect(viaAtlas.y).toBeCloseTo(direct.y, 6);
  });
});
