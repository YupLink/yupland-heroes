// Жила на карте: спрайт (гекс-обрезка + поворот), место в выпечке куска
// (местность → жила → дорога), туман прячет, перепечка по приезду картинки.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { R, gridOrigin } from "./hexGeometry";
import { COLOR } from "./betaCanvasScene";
import { MapStore } from "./mapStore";
import { HexTileCache } from "./hexTileCache";
import type { RoadRibbonCache } from "./roadRibbonCache";
import { bakeCells } from "./chunkBake";
import { ChunkIndex } from "./chunkIndex";
import { drawVein, resetVeinSprites } from "./veinDraw";
import { MAP_PRELOAD, veinArtKey } from "@/lib/gameArt";
import type { PackedCells } from "./unpackMap";
import { FakeCanvas, FakeCtx, fakeImg, spriteSource } from "@/test/veinCanvasFake";

beforeAll(() => {
  vi.stubGlobal("document", { createElement: () => new FakeCanvas() });
  vi.stubGlobal(
    "Path2D",
    class {
      moveTo() {}
      lineTo() {}
      closePath() {}
    },
  );
});
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => resetVeinSprites());

const ctx = () => new FakeCtx() as unknown as CanvasRenderingContext2D;

describe("drawVein", () => {
  it("спрайт: гекс-обрезка, потом поворот, картинка квадратом 2R", () => {
    const images = new Map([[veinArtKey("gold"), fakeImg("gold")]]);
    const g = ctx();
    expect(drawVein(g, images, { kind: "gold", rot: 120 })).toBeNull();
    const put = (g as unknown as FakeCtx).calls.filter((c) => c[0] === "drawImage");
    expect(put).toHaveLength(1);
    const sprite = put[0][1] as FakeCanvas;
    const names = sprite.ctx.calls.map((c) => c[0]);
    expect(names.indexOf("clip")).toBeLessThan(names.indexOf("rotate"));
    expect(sprite.ctx.calls.find((c) => c[0] === "rotate")?.[1]).toBeCloseTo((2 * Math.PI) / 3);
    expect(sprite.ctx.calls.find((c) => c[0] === "drawImage")?.slice(2)).toEqual([
      -R,
      -R,
      R * 2,
      R * 2,
    ]);
    expect(sprite.ctx.imageSmoothingQuality).toBe("high");
  });

  it("спрайт печётся один раз на вид × угол", () => {
    const images = new Map([
      [veinArtKey("gold"), fakeImg("gold")],
      [veinArtKey("diamonds"), fakeImg("diamonds")],
    ]);
    const srcs = new Set<unknown>();
    for (const v of [
      { kind: "gold", rot: 0 },
      { kind: "gold", rot: 0 },
      { kind: "gold", rot: 60 },
      { kind: "diamonds", rot: 0 },
    ] as const) {
      const g = ctx();
      drawVein(g, images, v);
      srcs.add((g as unknown as FakeCtx).calls[0][1]);
    }
    expect(srcs.size).toBe(3);
    expect([...srcs].map(spriteSource)).toEqual(["gold", "gold", "diamonds"]);
  });

  it("картинки ещё нет — ничего не рисуем, отдаём ключ на ожидание", () => {
    const g = ctx();
    const images = new Map([[veinArtKey("diamonds"), fakeImg("diamonds", false)]]);
    expect(drawVein(g, images, { kind: "diamonds", rot: 0 })).toBe("vein-diamonds");
    expect(drawVein(g, new Map(), { kind: "gold", rot: 0 })).toBe("vein-gold");
    expect((g as unknown as FakeCtx).calls).toHaveLength(0);
  });

  it("картинки жил — по требованию кадра, не сразу (ПРАВИЛА §9.1 п. 6)", () => {
    const veins = MAP_PRELOAD.filter((a) => a.key.startsWith("vein-"));
    expect(veins.map((a) => a.key).sort()).toEqual(["vein-diamonds", "vein-gold"]);
    expect(veins.every((a) => !a.eager)).toBe(true);
  });
});

/** Карта 4×3, местность везде; дорога на клетке 5; жилы на 5 (золото) и 6 (алмазы). */
function map(veins: number[] = [5, 1, 1, 6, 2, 3]): MapStore {
  const q: number[] = [];
  const r: number[] = [];
  for (let rr = 0; rr < 3; rr++)
    for (let qq = 0; qq < 4; qq++) {
      q.push(qq);
      r.push(rr);
    }
  const n = q.length;
  const p: PackedCells = {
    terrainIds: ["grass"],
    roadIds: ["dirt"],
    objectIds: [],
    decorationIds: [],
    buildingIds: [],
    q,
    r,
    t: new Array(n).fill(0),
    road: q.map((_, i) => (i === 5 ? 0 : -1)),
    obj: new Array(n).fill(-1),
    dec: new Array(n).fill(-1),
    bld: new Array(n).fill(-1),
    defeated: [],
    runners: [],
    voidFog: [],
    veins,
  };
  const { centerQ, c0q } = gridOrigin(8);
  return new MapStore(p, centerQ, c0q, false);
}

/** Лента дороги — готовый холст с картинкой «road» (своя выпечка ленты тут не важна). */
function ribbons(): RoadRibbonCache {
  const cv = new FakeCanvas();
  cv.ctx.drawImage(fakeImg("road"));
  return { get: () => cv } as unknown as RoadRibbonCache;
}

function bake(store: MapStore, hidden: Set<number>, veinsReady = true) {
  const g = new FakeCtx();
  const images = new Map([
    ["t:grass", fakeImg("terrain")],
    ["r:dirt", fakeImg("road")],
    [veinArtKey("gold"), fakeImg("gold", veinsReady)],
    [veinArtKey("diamonds"), fakeImg("diamonds", veinsReady)],
  ]);
  const missing = bakeCells(
    g as unknown as CanvasRenderingContext2D,
    { minX: -2000, maxX: 2000, minY: -2000, maxY: 2000 },
    {
      index: { store },
      tiles: new HexTileCache(),
      ribbons: ribbons(),
      images,
      seen: { hasIndex: (i) => !hidden.has(i) },
      revealAll: false,
    },
  );
  // Источник каждого drawImage на холсте куска, по порядку.
  const order = g.calls.filter((c) => c[0] === "drawImage").map((c) => spriteSource(c[1]));
  return { order, missing, g };
}

describe("выпечка куска с жилами", () => {
  it("местность → жила → дорога; только на клетках с жилой", () => {
    const { order } = bake(map(), new Set());
    expect(order.filter((s) => s === "gold")).toHaveLength(1);
    expect(order.filter((s) => s === "diamonds")).toHaveLength(1);
    const gold = order.indexOf("gold");
    expect(order[gold - 1]).toBe("terrain");
    expect(order[gold + 1]).toBe("road");
    const dia = order.indexOf("diamonds");
    expect(order[dia - 1]).toBe("terrain");
    expect(order.filter((s) => s === "terrain")).toHaveLength(12);
  });

  it("клетка под неразведанным туманом жилу не показывает", () => {
    const { order, g } = bake(map(), new Set([5]));
    expect(order).not.toContain("gold");
    expect(order).toContain("diamonds");
    expect(g.calls.some((c) => c[0] === "fill" && c[1] === COLOR.fogTile)).toBe(true);
  });

  it("картинка жилы не приехала — кусок помнит ключ и перепечётся", () => {
    const { order, missing } = bake(map(), new Set(), false);
    expect(order).not.toContain("gold");
    expect(missing).toContain("vein-gold");
    expect(missing).toContain("vein-diamonds");
  });

  it("без жил кусок печётся как раньше", () => {
    const { order, missing } = bake(map([]), new Set());
    expect(order.some((s) => s === "gold" || s === "diamonds")).toBe(false);
    expect(missing.some((k) => k.startsWith("vein-"))).toBe(false);
  });
});

describe("ChunkIndex: новый список жил — перепечь клетки, чья жила сменилась", () => {
  it("та же сетка, другой список жил → куски этих клеток, без сброса; тот же → ничего", () => {
    const a = map();
    // Жила дельтой (veinPatch): золото с 5 ушло, на 1 — алмазы, 6 — как было.
    const b = new MapStore(
      { ...a.packed, veins: [1, 2, 0, 6, 2, 3] },
      a.geom.centerQ,
      a.geom.c0q,
      false,
    );
    const same = new MapStore({ ...a.packed }, a.geom.centerQ, a.geom.c0q, false);
    let cleared = 0;
    let drops = 0;
    const idx = new ChunkIndex(() => drops++);
    const seen = { hasIndex: () => true };
    idx.sync(a, seen, false, () => cleared++);
    cleared = 0;
    idx.sync(same, seen, false, () => cleared++);
    expect(cleared).toBe(0);
    expect(drops).toBe(0);
    idx.sync(b, seen, false, () => cleared++);
    expect(cleared).toBe(0);
    expect(drops).toBeGreaterThan(0);
  });
});
