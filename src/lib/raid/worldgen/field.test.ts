// Мир по чанкам: доли суши и воды по спецификации, клетка — чистая функция
// (сид, q, r), чанки сходятся на стыке, участок не зависит от того, по
// скольким чанкам его считали.
import { describe, expect, it } from "vitest";
import { generateArea } from "@/lib/raid/worldgen/area";
import { baseCell } from "@/lib/raid/worldgen/cover";
import { makeWorld, terrainAt } from "@/lib/raid/worldgen/field";
import { chunkCells, chunksOfSize, xyToHex, type ChunkKey } from "@/lib/raid/worldgen/geo";
import { hexToXY } from "@/lib/raid/zonegen/noise";
import { keyOf } from "@/lib/raid/zonegen/town/hex";
import type { WorldArea, WorldCell } from "@/lib/raid/worldgen/spec";
import { LANDS, OCEAN, TEST_CATALOG, WATER, testSpec } from "@/test/worldSpec";

const share = (cells: WorldCell[], pred: (c: WorldCell) => boolean) =>
  cells.filter(pred).length / cells.length;

describe("местность", () => {
  it("доли суши и воды — как в спецификации (на карте 128)", () => {
    const w = makeWorld(testSpec(7));
    const cells = chunksOfSize(128)
      .flatMap(chunkCells)
      .map((c) => baseCell(w, c.q, c.r));
    expect(cells).toHaveLength(128 * 128);
    expect(share(cells, (c) => c.terrainId === WATER)).toBeGreaterThan(0.1);
    expect(share(cells, (c) => c.terrainId === WATER)).toBeLessThan(0.3);
    expect(share(cells, (c) => c.terrainId === OCEAN)).toBe(0);
    // Земли областей — все три, не одна на всю карту.
    for (const id of LANDS) expect(share(cells, (c) => c.terrainId === id)).toBeGreaterThan(0.03);
  });

  it("архипелаг: суша 30 % — появляется океан, вода у берега между ними", () => {
    const w = makeWorld(testSpec(11, { land: 0.3, shallow: 0.2 }));
    const cells = chunksOfSize(128)
      .flatMap(chunkCells)
      .map((c) => baseCell(w, c.q, c.r));
    const land = share(cells, (c) => (LANDS as readonly string[]).includes(c.terrainId));
    expect(land).toBeGreaterThan(0.15);
    expect(land).toBeLessThan(0.45);
    expect(share(cells, (c) => c.terrainId === OCEAN)).toBeGreaterThan(0.3);
  });

  it("клетка не зависит от порядка и кэша: два мира с одним сидом совпадают", () => {
    const a = makeWorld(testSpec(5));
    const b = makeWorld(testSpec(5));
    for (const c of chunkCells({ cx: 3, cy: -2 }).reverse()) terrainAt(b, c.q, c.r);
    for (const c of chunkCells({ cx: 3, cy: -2 })) {
      expect(baseCell(a, c.q, c.r)).toEqual(baseCell(b, c.q, c.r));
    }
  });

  it("другой сид — другой мир", () => {
    const a = makeWorld(testSpec(5));
    const b = makeWorld(testSpec(6));
    const cells = chunkCells({ cx: 0, cy: 0 });
    const same = cells.filter((c) => terrainAt(a, c.q, c.r) === terrainAt(b, c.q, c.r)).length;
    expect(same).toBeLessThan(cells.length);
  });

  it("на воде декора нет; объект — только на клетке без декора", () => {
    const w = makeWorld(testSpec(7));
    const cells = chunksOfSize(64)
      .flatMap(chunkCells)
      .map((c) => baseCell(w, c.q, c.r));
    expect(cells.some((c) => c.decorationId !== null)).toBe(true);
    expect(cells.some((c) => c.objectId !== null)).toBe(true);
    expect(cells.filter((c) => c.terrainId === WATER && c.decorationId !== null)).toEqual([]);
    expect(cells.filter((c) => c.decorationId !== null && c.objectId !== null)).toEqual([]);
  });

  it("точка → гекс обратна гексу → точке", () => {
    for (const c of chunkCells({ cx: -1, cy: 2 })) {
      const { x, y } = hexToXY(c.q, c.r);
      expect(xyToHex(x + 0.1, y - 0.1)).toEqual(c);
    }
  });
});

describe("чанки", () => {
  const spec = testSpec(9);
  const chunks: ChunkKey[] = [];
  for (let cy = -1; cy <= 1; cy++) for (let cx = -1; cx <= 1; cx++) chunks.push({ cx, cy });
  const byKey = (cells: WorldCell[]) => new Map(cells.map((c) => [keyOf(c), c]));

  it("по чанку или разом — каждая клетка одна и та же, ратуши те же", { timeout: 60_000 }, () => {
    const whole = generateArea(makeWorld(spec), { chunks, bounds: null, catalog: TEST_CATALOG });
    const w = makeWorld(spec);
    const parts = [...chunks]
      .reverse()
      .map((c) => generateArea(w, { chunks: [c], bounds: null, catalog: TEST_CATALOG }));
    const one = byKey(whole.cells);
    const many = byKey(parts.flatMap((p) => p.cells));
    expect(many.size).toBe(one.size);
    for (const [k, cell] of one) expect(many.get(k), k).toEqual(cell);
    const halls = (list: WorldArea["halls"]) => list.map((h) => `${h.q},${h.r}`).sort();
    expect(halls(parts.flatMap((p) => p.halls))).toEqual(halls(whole.halls));
  });

  it("свежий мир без памяти считает чанк так же", { timeout: 60_000 }, () => {
    const one = generateArea(makeWorld(spec), {
      chunks: [{ cx: 0, cy: 0 }],
      bounds: null,
      catalog: TEST_CATALOG,
    });
    const whole = byKey(
      generateArea(makeWorld(spec), { chunks, bounds: null, catalog: TEST_CATALOG }).cells,
    );
    for (const c of one.cells) expect(whole.get(keyOf(c))).toEqual(c);
  });

  it("тот же участок дважды — побайтно одинаков", { timeout: 60_000 }, () => {
    const run = () =>
      generateArea(makeWorld(spec), {
        chunks: chunksOfSize(96),
        bounds: { size: 96 },
        catalog: TEST_CATALOG,
      });
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
  });
});
