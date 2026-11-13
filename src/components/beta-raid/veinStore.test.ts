// Словарь жил из снимка: тройки lists.veins → veinAt(q, r) и veinsOf для кадра.
import { describe, expect, it } from "vitest";
import { syncVeins, veinAt, veinKey, veinsOf } from "./veinStore";
import { PackedEdit } from "./packedEdit";
import { MapStore } from "./mapStore";
import { gridOrigin } from "./hexGeometry";
import type { PackedCells } from "./unpackMap";

function packed(veins?: number[]): PackedCells {
  const q = [0, 1, 2, -3, 4];
  const r = [0, 0, 0, 5, -2];
  const n = q.length;
  return {
    terrainIds: ["grass"],
    roadIds: [],
    objectIds: [],
    decorationIds: [],
    buildingIds: [],
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
    ...(veins ? { veins } : {}),
  };
}

describe("veinsOf / veinAt", () => {
  it("вид по коду, поворот — градусы", () => {
    syncVeins(packed([1, 1, 2, 3, 2, 5]));
    expect(veinAt(1, 0)).toEqual({ kind: "gold", rot: 120 });
    expect(veinAt(-3, 5)).toEqual({ kind: "diamonds", rot: 300 });
    expect(veinAt(0, 0)).toBeNull();
    expect(veinAt(4, -2)).toBeNull();
  });

  it("битые тройки пропускаются, хвост без пары — тоже", () => {
    const v = veinsOf(packed([0, 3, 0, 1, 1, 7, 99, 1, 0, 4, 2, 1, 2, 1]));
    expect(v.size).toBe(1);
    expect(v.get(veinKey(4, -2))).toEqual({ kind: "diamonds", rot: 60 });
  });

  it("нет списка или он пуст — жил нет", () => {
    syncVeins(packed());
    expect(veinAt(1, 0)).toBeNull();
    expect(veinsOf(packed([])).size).toBe(0);
  });

  it("словарь кэшируется по ссылке на список, объекты жил общие", () => {
    const p = packed([1, 1, 0, 2, 1, 0]);
    const a = veinsOf(p);
    expect(veinsOf({ ...p })).toBe(a);
    expect(a.get(veinKey(1, 0))).toBe(a.get(veinKey(2, 0)));
  });

  it("правка кистью/дельта (PackedEdit) список жил не теряет", () => {
    const p = packed([2, 2, 3]);
    const e = new PackedEdit(p);
    e.col("t")[0] = -1;
    const next = e.finish();
    expect(next).not.toBe(p);
    expect(next.veins).toBe(p.veins);
    expect(veinsOf(next)).toBe(veinsOf(p));
  });

  it("развёрнутая карта (MapStore) — ответ veinAt", () => {
    syncVeins(packed());
    const { centerQ, c0q } = gridOrigin(8);
    new MapStore(packed([4, 1, 4]), centerQ, c0q, false);
    expect(veinAt(4, -2)).toEqual({ kind: "gold", rot: 240 });
  });
});
