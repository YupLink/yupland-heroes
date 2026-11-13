// Копия колонки при правке — того же типа (06.11.2026): Int16Array с сервера не
// раздувается в number[] вчетверо на каждое событие карты.
import { describe, expect, it } from "vitest";
import { PackedEdit } from "./packedEdit";
import type { PackedCells } from "./unpackMap";

function packed(): PackedCells {
  const col = (v: number[]) => Int16Array.from(v) as unknown as number[];
  return {
    q: col([0, 1, 2]),
    r: col([0, 0, 0]),
    t: col([0, 0, 0]),
    road: col([-1, -1, -1]),
    obj: col([-1, 5, -1]),
    dec: col([-1, -1, -1]),
    bld: col([-1, -1, -1]),
    defeated: [],
    runners: [],
    voidFog: [],
    terrainIds: ["grass"],
    roadIds: [],
    objectIds: ["a", "b", "c", "d", "e", "f"],
    decorationIds: [],
    buildingIds: [],
  } as unknown as PackedCells;
}

describe("PackedEdit — копия колонки", () => {
  it("правка клетки: копия того же типа, исходник не тронут", () => {
    const src = packed();
    const edit = new PackedEdit(src);
    edit.set("obj", 0, 3);
    const out = edit.finish();
    expect(out.obj).toBeInstanceOf(Int16Array);
    expect(Array.from(out.obj)).toEqual([3, 5, -1]);
    expect(Array.from(src.obj)).toEqual([-1, 5, -1]);
    expect(out.q).toBe(src.q); // нетронутые колонки — те же массивы
  });

  it("значение не влезает в Int16 — колонка становится обычным массивом", () => {
    const edit = new PackedEdit(packed());
    edit.set("obj", 1, 40_000);
    const out = edit.finish();
    expect(Array.isArray(out.obj)).toBe(true);
    expect(out.obj).toEqual([-1, 40_000, -1]);
  });

  it("новая клетка дописывается в конец (колонки — обычные массивы)", () => {
    const edit = new PackedEdit(packed());
    const i = edit.addRow("9,9", 9, 9);
    edit.set("obj", i, 2);
    const out = edit.finish();
    expect(i).toBe(3);
    expect(out.q).toEqual([0, 1, 2, 9]);
    expect(out.obj).toEqual([-1, 5, -1, 2]);
  });
});
