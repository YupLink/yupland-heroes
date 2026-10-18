// Двоичный снимок: туда и обратно без потерь, колонки — виды без копий,
// чужой формат отвергается.
import { describe, expect, it } from "vitest";
import { decodeMapBlob, encodeMapBlob, MAP_BLOB_FORMAT, type MapBlobHeader } from "./mapCodec";

const header = (n: number, extra: Partial<MapBlobHeader> = {}): MapBlobHeader => ({
  format: MAP_BLOB_FORMAT,
  n,
  revision: 42,
  variant: "player",
  map: { id: "m", name: "Мир", size: 300 },
  dicts: { terrainIds: ["t1"], roadIds: [], objectIds: ["boss:x"], decorationIds: [], buildingIds: [] },
  lists: { defeated: [1], runners: [], voidFog: [], townHalls: [] },
  terrains: { t1: { id: "t1", name: "трава" } },
  objects: {},
  decorations: {},
  roads: {},
  buildings: {},
  buildingTiers: { "0,0": 2 },
  doors: [],
  ...extra,
});

describe("lib/raid/mapCodec", () => {
  it("кодирует и декодирует колонки и заголовок без потерь", () => {
    const n = 5;
    const cols = {
      q: [-3, -2, 0, 1, 232],
      r: [10, 10, 11, 11, -122],
      t: [0, 0, 0, -1, 0],
      road: [-1, -1, -1, -1, -1],
      obj: [-1, 0, -1, -1, -1],
      dec: [-1, -1, -1, -1, -1],
      bld: [-1, -1, -1, -1, -1],
    };
    const bytes = encodeMapBlob(header(n), cols);
    const back = decodeMapBlob(bytes);
    expect(back).not.toBeNull();
    expect(back!.header.revision).toBe(42);
    expect(back!.header.terrains).toEqual({ t1: { id: "t1", name: "трава" } });
    expect(Array.from(back!.columns.q)).toEqual(cols.q);
    expect(Array.from(back!.columns.r)).toEqual(cols.r);
    expect(Array.from(back!.columns.obj)).toEqual(cols.obj);
    // Виды на тот же буфер, не копии.
    expect(back!.columns.q.buffer).toBe(bytes.buffer);
  });
  it("нечётная длина заголовка не ломает выравнивание Int16", () => {
    for (const name of ["a", "ab", "abc", "abcd"]) {
      const h = header(3, { map: { id: name, name, size: 1 } });
      const bytes = encodeMapBlob(h, { q: [1, 2, 3], r: [4, 5, 6], t: [0, 0, 0], road: [-1, -1, -1], obj: [-1, -1, -1], dec: [-1, -1, -1], bld: [-1, -1, -1] });
      const back = decodeMapBlob(bytes.buffer.slice(0));
      expect(Array.from(back!.columns.r)).toEqual([4, 5, 6]);
    }
  });
  it("чужие байты и чужой формат — null", () => {
    expect(decodeMapBlob(new Uint8Array([1, 2, 3]))).toBeNull();
    const bad = encodeMapBlob({ ...header(1), format: 99 }, { q: [0], r: [0], t: [0], road: [0], obj: [0], dec: [0], bld: [0] });
    expect(decodeMapBlob(bad)).toBeNull();
  });
});
