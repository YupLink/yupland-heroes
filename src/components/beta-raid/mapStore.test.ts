// Колонки → сетка → клетка по номеру: проверяем, что арифметический перебор
// видимых клеток находит ровно то же, что и полный перебор с проверкой
// координат, и что туман по битам совпадает со старым набором ключей.
import { describe, expect, it } from "vitest";
import { MapStore } from "./mapStore";
import { buildMapIndex, forEachVisible } from "./mapIndex";
import { FogMask, fogView } from "./fogMask";
import { axialToPixel, gridOrigin, hexDistance } from "./hexGeometry";
import type { PackedCells } from "./unpackMap";

/** Прямоугольная карта size×size, как делает сервер, с дырой посередине. */
function synth(size: number): { packed: PackedCells; hole: string } {
  const q: number[] = [];
  const r: number[] = [];
  const t: number[] = [];
  const road: number[] = [];
  const obj: number[] = [];
  const dec: number[] = [];
  const bld: number[] = [];
  const hole = `${Math.floor(size / 2)},${Math.floor(size / 2)}`;
  for (let rr = 0; rr < size; rr++) {
    for (let qq = 0; qq < size; qq++) {
      if (`${qq},${rr}` === hole) continue;
      q.push(qq);
      r.push(rr);
      t.push(qq % 2);
      road.push(rr % 3 === 0 ? 0 : -1);
      obj.push(qq === rr ? 0 : -1);
      dec.push(-1);
      bld.push(-1);
    }
  }
  const packed: PackedCells = {
    terrainIds: ["grass", "sand"],
    roadIds: ["dirt"],
    objectIds: ["boss"],
    decorationIds: [],
    buildingIds: [],
    q,
    r,
    t,
    road,
    obj,
    dec,
    bld,
    defeated: [3],
    runners: [],
    voidFog: [5],
  };
  return { packed, hole };
}

describe("MapStore", () => {
  const size = 12;
  const { packed, hole } = synth(size);
  const { centerQ, c0q } = gridOrigin(size);
  const store = new MapStore(packed, centerQ, c0q, false);

  it("сетка отвечает номером по координатам и -1 за дырой и краем", () => {
    expect(store.n).toBe(size * size - 1);
    expect(store.index(0, 0)).toBe(0);
    expect(store.index(1, 0)).toBe(1);
    expect(store.indexOfKey(hole)).toBe(-1);
    expect(store.index(-1, 0)).toBe(-1);
    expect(store.index(size, 0)).toBe(-1);
    expect(store.index(0, size)).toBe(-1);
    for (let i = 0; i < store.n; i++) expect(store.index(packed.q[i], packed.r[i])).toBe(i);
  });

  it("клетка по ключу — та же форма, что у старого словаря", () => {
    const c = store.cells["3,3"];
    expect(c?.objectId).toBe("boss");
    expect(store.cells["1,0"]?.terrainId).toBe("sand");
    expect(store.cells["0,0"]?.roadId).toBe("dirt");
    expect(store.cells[hole]).toBeUndefined();
    expect(hole in store.cells).toBe(false);
    const dead = store.cellAt(3);
    expect(dead.objectDefeated ?? false).toBe(packed.obj[3] >= 0);
    expect(store.cellAt(5).voidFog).toBe(true);
    expect(Object.keys(store.cells)).toHaveLength(store.n);
  });

  it("координаты центров совпадают с axialToPixel", () => {
    for (let i = 0; i < store.n; i += 7) {
      const p = axialToPixel(packed.q[i], packed.r[i], centerQ, c0q);
      expect(store.geom.x[i]).toBeCloseTo(p.x, 3);
      expect(store.geom.y[i]).toBeCloseTo(p.y, 3);
    }
  });

  it("видимые клетки — ровно те, чьи центры внутри окна, сверху вниз", () => {
    const index = buildMapIndex(store);
    const view = { minX: -60, maxX: 90, minY: -50, maxY: 120 };
    const got: number[] = [];
    forEachVisible(index, view, (c) => {
      expect(c.i).toBe(store.index(c.q, c.r));
      expect(c.x).toBe(store.geom.x[c.i]);
      got.push(c.i);
    });
    const want: number[] = [];
    for (let i = 0; i < store.n; i++) {
      const x = store.geom.x[i];
      const y = store.geom.y[i];
      if (x >= view.minX && x <= view.maxX && y >= view.minY && y <= view.maxY) want.push(i);
    }
    expect(got.length).toBeGreaterThan(0);
    expect(new Set(got)).toEqual(new Set(want));
    for (let k = 1; k < got.length; k++) {
      const a = got[k - 1];
      const b = got[k];
      expect(
        packed.r[b] > packed.r[a] || (packed.r[b] === packed.r[a] && packed.q[b] > packed.q[a]),
      ).toBe(true);
    }
  });

  it("маска дорог помечает соседей с той же дорогой", () => {
    // Строка r=0 — сплошная дорога: у клетки (1,0) соседи (2,0) и (0,0) — биты 0 и 3.
    expect(store.roadMask(store.index(1, 0)) & 0b1001).toBe(0b1001);
    expect(store.roadMask(store.index(1, 1))).toBe(0);
  });
});

describe("FogMask", () => {
  const size = 10;
  const { packed } = synth(size);
  const { centerQ, c0q } = gridOrigin(size);
  const store = new MapStore(packed, centerQ, c0q, false);

  it("диск вокруг точки = старый перебор ключей; купол скрыт", () => {
    const mask = new FogMask(store);
    const added = mask.addDisc(2, 2, 2);
    expect(added).toBe(19);
    expect(mask.size).toBe(19);
    expect(mask.has("2,2")).toBe(true);
    expect(mask.has("4,2")).toBe(true);
    expect(mask.has("5,2")).toBe(false);
    expect(mask.addDisc(2, 2, 2)).toBe(0);
    expect(mask.bounds).toEqual({ minQ: 0, maxQ: 4, minR: 0, maxR: 4 });
    // Второй диск задевает дыру (5,5) и пересекается с первым: сверяем с
    // честным перебором всех клеток по расстоянию.
    mask.addDisc(4, 4, 2);
    let want = 0;
    for (let i = 0; i < store.n; i++) {
      const q = packed.q[i];
      const r = packed.r[i];
      if (hexDistance(q, r, 2, 2) <= 2 || hexDistance(q, r, 4, 4) <= 2) want++;
    }
    expect(mask.size).toBe(want);
    expect(store.indexOfKey("5,5")).toBe(-1);
    // Клетка 5 = (5,0) под куполом: бит ставится, но игроку не видна.
    expect(mask.add("5,0")).toBe(true);
    expect(mask.rawIndex(5)).toBe(true);
    expect(mask.has("5,0")).toBe(false);
    // Перебор ключей отдаёт всё разведанное без клетки под куполом.
    expect([...mask]).toHaveLength(mask.size - 1);
  });

  it("перекладка на другую сетку сохраняет координаты", () => {
    const mask = new FogMask(store);
    mask.addMany(["1,1", "2,2", "9,9"]);
    const bigger = synth(size + 4).packed;
    const g2 = gridOrigin(size + 4);
    const store2 = new MapStore(bigger, g2.centerQ, g2.c0q, false);
    const next = mask.rebind(store2);
    expect(next).not.toBe(mask);
    expect(next.size).toBe(3);
    expect(next.has("9,9")).toBe(true);
    expect(next.hasIndex(store2.index(2, 2))).toBe(true);
    expect(mask.rebind(store)).toBe(mask);
  });

  it("биты по номерам ложатся ровно на свои клетки", () => {
    const mask = new FogMask(store);
    const bits = new Uint8Array((store.n + 7) >> 3);
    for (const i of [0, 7, 8, store.n - 1]) bits[i >> 3] |= 1 << (i & 7);
    expect(mask.addBits(bits)).toBe(4);
    expect(mask.addBits(bits)).toBe(0);
    expect(mask.rawIndex(7)).toBe(true);
    expect(mask.rawIndex(9)).toBe(false);
    expect(mask.has(store.key(store.n - 1))).toBe(true);
    // Короче, чем клеток, — читаем сколько есть; длиннее — лишнее не трогаем.
    expect(new FogMask(store).addBits(new Uint8Array([0xff]))).toBe(8);
  });

  it("снимок для React — та же маска, новый номер версии", () => {
    const mask = new FogMask(store);
    const v1 = fogView(mask);
    mask.add("0,0");
    mask.version++;
    const v2 = fogView(mask);
    expect(v1.mask).toBe(v2.mask);
    expect(v2.version).toBe(v1.version + 1);
    expect(v2.has("0,0")).toBe(true);
    expect(v2.size).toBe(1);
    expect(mask.addedSince(0)).toEqual([0]);
    expect(mask.addedSince(1)).toEqual([]);
  });
});

describe("fogStorage.signature", () => {
  it("тот же набор клеток в другом порядке — другая подпись", async () => {
    const { signature } = await import("./fogStorage");
    const { packed } = synth(8);
    const { centerQ, c0q } = gridOrigin(8);
    const a = new MapStore(packed, centerQ, c0q, false);
    const rev = {
      ...packed,
      q: [...packed.q].reverse(),
      r: [...packed.r].reverse(),
      t: [...packed.t].reverse(),
      road: [...packed.road].reverse(),
      obj: [...packed.obj].reverse(),
      dec: [...packed.dec].reverse(),
      bld: [...packed.bld].reverse(),
    };
    const b = new MapStore(rev, centerQ, c0q, false);
    expect(a.n).toBe(b.n);
    expect(signature(a)).not.toBe(signature(b));
    expect(signature(a)).toBe(signature(new MapStore({ ...packed }, centerQ, c0q, false)));
  });
});
