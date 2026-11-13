// Подпись порядка клеток считается один раз на колонки карты, а не на каждый
// рендер: тот же ответ, что прямой хэш; новые колонки — новый хэш.
import { describe, expect, it } from "vitest";
import { cellOrderHash } from "@/lib/raid/cellOrder";
import { MapStore } from "./mapStore";
import { gridOrigin } from "./hexGeometry";
import { orderOf } from "./fogStorage";
import type { PackedCells } from "./unpackMap";

function synth(size: number, flip = false): PackedCells {
  const q: number[] = [];
  const r: number[] = [];
  for (let rr = 0; rr < size; rr++)
    for (let qq = 0; qq < size; qq++) {
      q.push(flip ? size - 1 - qq : qq);
      r.push(rr);
    }
  const n = q.length;
  const none = () => new Array<number>(n).fill(-1);
  return {
    terrainIds: ["g"],
    roadIds: [],
    objectIds: [],
    decorationIds: [],
    buildingIds: [],
    q,
    r,
    t: new Array<number>(n).fill(0),
    road: none(),
    obj: none(),
    dec: none(),
    bld: none(),
    defeated: [],
    runners: [],
    voidFog: [],
  };
}

describe("orderOf", () => {
  const { centerQ, c0q } = gridOrigin(40);
  it("matches the direct hash and is reused for the same columns", () => {
    const packed = synth(40);
    const a = new MapStore(packed, centerQ, c0q, false);
    expect(orderOf(a)).toBe(cellOrderHash(packed.q, packed.r, a.n));
    // A live event gives a new store over the same q/r columns: same answer.
    const b = new MapStore({ ...packed, obj: [...packed.obj] }, centerQ, c0q, false);
    expect(orderOf(b)).toBe(orderOf(a));
  });
  it("new columns with another order give another signature", () => {
    const a = new MapStore(synth(40), centerQ, c0q, false);
    const b = new MapStore(synth(40, true), centerQ, c0q, false);
    expect(orderOf(b)).not.toBe(orderOf(a));
    expect(orderOf(b)).toBe(cellOrderHash(b.packed.q, b.packed.r, b.n));
  });
});

describe("MapStore per-column caches", () => {
  const { centerQ, c0q } = gridOrigin(40);
  it("a live event (new store over the same columns) reuses keys and road masks", () => {
    const packed = synth(40);
    packed.roadIds = ["dirt"];
    packed.road = packed.q.map((q, i) => (packed.r[i] === 3 ? 0 : -1));
    const a = new MapStore(packed, centerQ, c0q, false);
    const keyA = a.key(5);
    const maskA = a.roadMask(3 * 40 + 4);
    const b = new MapStore({ ...packed, obj: [...packed.obj] }, centerQ, c0q, false);
    expect(b.key(5)).toBe(keyA);
    expect(b.roadMask(3 * 40 + 4)).toBe(maskA);
    // A road edit clones the road column — masks are rebuilt for it.
    const road = [...packed.road];
    road[3 * 40 + 5] = -1;
    const c = new MapStore({ ...packed, road }, centerQ, c0q, false);
    expect(c.roadMask(3 * 40 + 4)).not.toBe(maskA);
  });
});
