// Порядок слоёв на границе кусков статичного слоя: тайл соседа сверху обязан
// лечь ПОД дерево, как в покадровом порядке «сверху вниз» — в каждом канвасе,
// где встречаются оба, и в кадре с недопечёнными кусками. Канвасы соседей не
// пересекаются дальше шва: иначе кусок, положенный позже, накрывал бы
// верхушку дерева из соседнего («ёлку отгрызает»).
import { beforeAll, describe, expect, it } from "vitest";
import { MapStore } from "./mapStore";
import { buildMapIndex } from "./mapIndex";
import { FogMask, fogView } from "./fogMask";
import { R, axialToPixel, gridOrigin } from "./hexGeometry";
import { HexTileCache } from "./hexTileCache";
import { RoadRibbonCache } from "./roadRibbonCache";
import { ChunkLayer } from "./chunkLayer";
import { SEAM, chunkRect } from "./chunkIndex";
import { drawStatic } from "./drawStatic";
import { drawCells } from "./betaCanvasDraw";
import type { PackedCells } from "./unpackMap";
import { FakeCtx, FakeImage, installCanvasFakes, type Op } from "@/test/canvasFakes";

function synth(size: number, trees: Array<[number, number]>): PackedCells {
  const q: number[] = [];
  const r: number[] = [];
  for (let rr = 0; rr < size; rr++)
    for (let qq = 0; qq < size; qq++) {
      q.push(qq);
      r.push(rr);
    }
  const n = q.length;
  const dec = new Array<number>(n).fill(-1);
  for (const [tq, tr] of trees) dec[tr * size + tq] = 0;
  return {
    terrainIds: ["grass"],
    roadIds: [],
    objectIds: [],
    decorationIds: ["fir"],
    buildingIds: [],
    q,
    r,
    t: new Array<number>(n).fill(0),
    road: new Array<number>(n).fill(-1),
    obj: new Array<number>(n).fill(-1),
    dec,
    bld: new Array<number>(n).fill(-1),
    defeated: [],
    runners: [],
    voidFog: [],
  };
}

beforeAll(installCanvasFakes);

const SIZE = 30;
const { centerQ, c0q } = gridOrigin(SIZE);
const px = (q: number, r: number) => axialToPixel(q, r, centerQ, c0q);
const DEC_W = R * 1.5;
const DEC_H = DEC_W * (264 / 160);
type View = { minX: number; maxX: number; minY: number; maxY: number };

function scene(g: FakeCtx, store: MapStore, view: View, mask = new FogMask(store)) {
  return {
    g: g as unknown as CanvasRenderingContext2D,
    W: 0,
    H: 0,
    offset: { x: 0, y: 0 },
    scale: 1,
    toPixel: px,
    images: new Map<string, HTMLImageElement>([
      ["t:grass", new FakeImage(128, 128) as unknown as HTMLImageElement],
      ["d:fir", new FakeImage(160, 264) as unknown as HTMLImageElement],
    ]),
    objectRings: new Map<string, string>(),
    tiles: new HexTileCache(),
    ribbons: new RoadRibbonCache(),
    view,
    covered: new Set<number>(),
    buildingTiers: {},
    seen: fogView(mask),
    visible: new Set<number>(),
    revealAll: true,
    voidCells: new Set<string>(),
    players: new Map<string, number>(),
    ships: new Map(),
    heroCell: null,
    moving: false,
    bucket: 1,
  };
}

const near = (a: number, b: number) => Math.abs(a - b) < 0.01;
const isDec = (o: Op, T: { x: number; y: number }) =>
  o.kind === "dec" && near(o.x, T.x - DEC_W / 2) && near(o.y, T.y + R * 0.55 - DEC_H);
const isTile = (o: Op, N: { x: number; y: number }) =>
  o.kind === "tile" &&
  near(o.x, N.x - (R * Math.sqrt(3) + 2) / 2) &&
  near(o.y, N.y - (R * 2 + 2) / 2);

/**
 * Кадр по «канвасам»: каждый положенный кусок — свой канвас, а куски,
 * нарисованные в холст под обрезкой, — отрезки холста от clip до clip.
 */
function segments(frame: Op[]): Op[][] {
  const out: Op[][] = [];
  let cur: Op[] = [];
  for (const o of frame) {
    if (o.kind === "chunk") {
      if (cur.length) out.push(cur);
      cur = [];
      out.push(o.src?.ops ?? []);
    } else if (o.kind === "clip") {
      if (cur.length) out.push(cur);
      cur = [o];
    } else cur.push(o);
  }
  if (cur.length) out.push(cur);
  return out;
}

/** В каждом канвасе, где есть и тайл N, и дерево T, тайл — раньше; таких канвасов ≥ 1. */
function expectTileUnderTree(
  frame: Op[],
  T: { x: number; y: number },
  N: { x: number; y: number },
): void {
  let both = 0;
  for (const seg of segments(frame)) {
    const dec = seg.findIndex((o) => isDec(o, T));
    const tile = seg.findIndex((o) => isTile(o, N));
    if (dec < 0 || tile < 0) continue;
    both++;
    expect(tile).toBeLessThan(dec);
  }
  expect(both).toBeGreaterThan(0);
}

describe("куски: порядок слоёв на границе", () => {
  it("эталон по клеткам: тайл соседа сверху-справа лежит ПОД деревом", () => {
    const store = new MapStore(synth(SIZE, [[15, 16]]), centerQ, c0q, false);
    const T = px(15, 16);
    const N = px(16, 15);
    // T — в куске 0, N — в куске 1, а левая грань его гекса идёт по оси дерева.
    expect(T.x).toBeCloseTo(363.73, 1);
    expect(N.x).toBeCloseTo(387.98, 1);
    const g = new FakeCtx();
    drawCells(
      scene(g, store, { minX: 200, maxX: 600, minY: -100, maxY: 200 }),
      buildMapIndex(store),
    );
    expectTileUnderTree(g.ops, T, N);
  });

  it("в покое: соседние куски не пересекаются дальше шва, в каждом тайл под деревом", () => {
    const store = new MapStore(synth(SIZE, [[15, 16]]), centerQ, c0q, false);
    const g = new FakeCtx();
    const s = scene(g, store, { minX: 200, maxX: 600, minY: -100, maxY: 200 });
    const st = drawStatic(s, buildMapIndex(store), new ChunkLayer(), 1, 1000);
    expect(st.pending).toBe(0);
    s.covered = st.covered;
    drawCells(s, buildMapIndex(store));
    expectTileUnderTree(g.ops, px(15, 16), px(16, 15));
    // Слой накрыл всё: по клеткам местность и декор больше не рисуются.
    expect(g.ops.filter((o) => o.kind !== "chunk")).toEqual([]);
    const placed = g.ops.filter((o) => o.kind === "chunk");
    for (const a of placed)
      for (const b of placed) {
        if (a === b || !near(a.y, b.y) || b.x <= a.x) continue;
        // Перекрытие — два шва плюс по пикселю снапа с каждой стороны, не больше.
        expect(a.x + a.w - b.x).toBeLessThanOrEqual(SEAM * 2 + 2);
      }
  });

  it("смешанный кадр: кусок сверху не испечён — рисуется в холст под обрезкой, тайл под деревом", () => {
    const store = new MapStore(synth(SIZE, [[9, 15]]), centerQ, c0q, false);
    const T = px(9, 15);
    const N = px(9, 14); // T — верхний ряд куска (0,0), N — в куске (0,-1)
    expect(T.y).toBe(0);
    expect(N.y).toBe(-42);
    const chunks = new ChunkLayer();
    const mask = new FogMask(store); // одна маска на оба кадра — иначе sync сбросит всё
    // Кадр 1: в кадре только кусок (0,0) — печём его целиком.
    const s1 = scene(new FakeCtx(), store, { minX: 10, maxX: 370, minY: 10, maxY: 370 }, mask);
    expect(drawStatic(s1, buildMapIndex(store), chunks, 1, 1000).pending).toBe(0);
    // Кадр 2: камера ушла вверх-влево, в кадре четыре куска; бюджета хватает ровно на один
    // (первый по порядку — (-1,-1)), кусок (0,-1) над деревом печётся в холст.
    const g2 = new FakeCtx();
    const s2 = scene(g2, store, { minX: -370, maxX: 370, minY: -370, maxY: 370 }, mask);
    const st2 = drawStatic(s2, buildMapIndex(store), chunks, 1, 0.000001);
    expect(st2.pending).toBe(2);
    expect(st2.covered.size).toBe(4);
    s2.covered = st2.covered;
    drawCells(s2, buildMapIndex(store));
    // Обрезка — по прямоугольнику куска, урезанному до кадра.
    const r = chunkRect(0, -1);
    const clip = g2.ops.find((o) => o.kind === "clip" && o.x === r.minX && o.y === -370);
    expect(clip).toMatchObject({ w: 370 - r.minX, h: r.maxY + 370 });
    expectTileUnderTree(g2.ops, T, N);
  });
});
