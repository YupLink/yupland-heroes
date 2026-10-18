// Устаревание кусков статичного слоя: журнал тумана, дельта колонок, сброс.
import { describe, expect, it } from "vitest";
import { MapStore } from "./mapStore";
import { FogMask, fogView } from "./fogMask";
import { ChunkIndex, CHUNK, REACH, SEAM, chunkId, chunkRect, chunkX, chunkY } from "./chunkIndex";
import { ROAD_DIRS, gridOrigin } from "./hexGeometry";
import type { PackedCells } from "./unpackMap";

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
    terrainIds: ["grass", "sand"],
    roadIds: ["dirt"],
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
  };
}

function harness() {
  const dropped: number[] = [];
  let cleared = 0;
  const idx = new ChunkIndex((cx, cy) => dropped.push(chunkId(cx, cy)));
  const clearAll = () => {
    cleared++;
  };
  return { idx, dropped, clearAll, count: () => cleared };
}

describe("ChunkIndex", () => {
  const size = 40;
  const { centerQ, c0q } = gridOrigin(size);
  const packed = synth(size);
  const store = new MapStore(packed, centerQ, c0q, false);
  const chunkOf = (i: number) => chunkId(chunkX(store.geom.x[i]), chunkY(store.geom.y[i]));
  /**
   * Куски, которых касается рисунок клетки (с учётом шва): кусок печёт всё,
   * что его задевает, поэтому ронять надо каждый такой, а не только кусок центра.
   */
  const chunksOf = (i: number, tall = false): number[] => {
    const x = store.geom.x[i];
    const y = store.geom.y[i];
    const up = tall ? REACH.dec : REACH.y;
    const out: number[] = [];
    for (let cy = chunkY(y - up - SEAM); cy <= chunkY(y + REACH.y + SEAM); cy++)
      for (let cx = chunkX(x - REACH.x - SEAM); cx <= chunkX(x + REACH.x + SEAM); cx++)
        out.push(chunkId(cx, cy));
    return out;
  };
  /** Клетка, чей центр стоит вплотную к вертикальной границе кусков (слева от неё). */
  const nearEdge = (() => {
    for (let i = 0; i < store.n; i++) {
      const x = store.geom.x[i];
      if (x < CHUNK && x + REACH.x > CHUNK && store.geom.y[i] > 0) return i;
    }
    throw new Error("нет клетки у границы");
  })();

  it("первый кадр — сброс, повтор с тем же store и маской — ничего", () => {
    const h = harness();
    const mask = new FogMask(store);
    const seen = fogView(mask);
    expect(h.idx.sync(store, seen, false, h.clearAll)).toBe(true);
    expect(h.idx.sync(store, seen, false, h.clearAll)).toBe(false);
    expect(h.count()).toBe(1);
    expect(h.dropped).toEqual([]);
  });

  it("разведанные клетки роняют только свои куски", () => {
    const h = harness();
    const mask = new FogMask(store);
    const seen = fogView(mask);
    h.idx.sync(store, seen, false, h.clearAll);
    mask.addDisc(20, 20, 1);
    h.idx.sync(store, seen, false, h.clearAll);
    const want = new Set(mask.addedSince(0).flatMap((i) => chunksOf(i)));
    expect(new Set(h.dropped)).toEqual(want);
    expect(h.count()).toBe(1);
    // Клетка у границы кусков: её тайл заходит в соседний кусок — падают оба.
    h.dropped.length = 0;
    mask.addDisc(packed.q[nearEdge], packed.r[nearEdge], 0);
    h.idx.sync(store, seen, false, h.clearAll);
    expect(new Set(h.dropped)).toEqual(new Set(chunksOf(nearEdge)));
    expect(h.dropped.length).toBeGreaterThan(1);
    // Повтор без новых клеток — тишина.
    h.dropped.length = 0;
    h.idx.sync(store, seen, false, h.clearAll);
    expect(h.dropped).toEqual([]);
  });

  it("дельта по объектам кусок не трогает, по местности — роняет клетку", () => {
    const h = harness();
    const mask = new FogMask(store);
    const seen = fogView(mask);
    h.idx.sync(store, seen, false, h.clearAll);
    // Убили объект: клонирована только колонка obj.
    const killed = new MapStore({ ...packed, obj: [...packed.obj] }, centerQ, c0q, false);
    expect(killed.geom).toBe(store.geom);
    h.idx.sync(killed, seen, false, h.clearAll);
    expect(h.dropped).toEqual([]);
    expect(h.count()).toBe(1);
    // Перекрасили клетку 777.
    const t = [...packed.t];
    t[777] = 1;
    const painted = new MapStore({ ...packed, t }, centerQ, c0q, false);
    h.idx.sync(painted, seen, false, h.clearAll);
    expect(new Set(h.dropped)).toEqual(new Set(chunksOf(777)));
    expect(h.dropped).toContain(chunkOf(777));
    // Поставили дерево у границы: декор печётся в кусок и торчит вверх на
    // высоту картинки — устарел и кусок над клеткой, и кусок справа.
    h.dropped.length = 0;
    const dec = [...packed.dec];
    dec[nearEdge] = 0;
    const planted = new MapStore({ ...packed, t, dec }, centerQ, c0q, false);
    h.idx.sync(planted, seen, false, h.clearAll);
    expect(new Set(h.dropped)).toEqual(new Set(chunksOf(nearEdge, true)));
    expect(h.dropped.length).toBeGreaterThan(new Set(chunksOf(nearEdge)).size);
    // Сняли дерево: старая верхушка лежит в куске выше — он тоже падает.
    h.dropped.length = 0;
    h.idx.sync(new MapStore({ ...packed, t }, centerQ, c0q, false), seen, false, h.clearAll);
    expect(new Set(h.dropped)).toEqual(new Set(chunksOf(nearEdge, true)));
  });

  it("дорога роняет куски соседей и их соседей — маска ленты и срезка ступенек", () => {
    const h = harness();
    const mask = new FogMask(store);
    const seen = fogView(mask);
    h.idx.sync(store, seen, false, h.clearAll);
    const road = [...packed.road];
    const i = store.index(20, 20);
    road[i] = 0;
    const next = new MapStore({ ...packed, road }, centerQ, c0q, false);
    h.idx.sync(next, seen, false, h.clearAll);
    const ring = (q: number, r: number) => ROAD_DIRS.map((d) => store.index(q + d.q, r + d.r));
    const cells = [
      i,
      ...ring(20, 20),
      ...ROAD_DIRS.flatMap((d) => ring(20 + d.q, 20 + d.r)),
    ].filter((j) => j >= 0);
    expect(new Set(h.dropped)).toEqual(new Set(cells.flatMap((j) => chunksOf(j))));
    expect(h.dropped).toContain(chunkOf(i));
  });

  it("новая маска, купол или раскрытие — сброс целиком", () => {
    const h = harness();
    const mask = new FogMask(store);
    h.idx.sync(store, fogView(mask), false, h.clearAll);
    h.idx.sync(store, fogView(mask), true, h.clearAll);
    expect(h.count()).toBe(2);
    h.idx.sync(store, fogView(new FogMask(store)), true, h.clearAll);
    expect(h.count()).toBe(3);
    const domed = new MapStore({ ...packed, voidFog: [1] }, centerQ, c0q, false);
    h.idx.sync(domed, fogView(new FogMask(domed)), true, h.clearAll);
    expect(h.count()).toBe(4);
  });

  it("номера кусков — целочисленное деление, минус не ломает", () => {
    expect(chunkX(-1)).toBe(-1);
    expect(chunkX(CHUNK)).toBe(1);
    expect(chunkId(-1, -1)).not.toBe(chunkId(0, 0));
    expect(chunkId(1, 0)).toBe(chunkId(0, 0) + 1);
  });

  it("прямоугольники соседних кусков перекрываются ровно на два шва", () => {
    const a = chunkRect(0, 0);
    const b = chunkRect(1, 0);
    expect(a.maxX - b.minX).toBe(SEAM * 2);
    expect(a.maxX - a.minX).toBe(CHUNK + SEAM * 2);
  });
});
