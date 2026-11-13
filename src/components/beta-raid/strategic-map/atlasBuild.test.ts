// Картинка ландшафта окна «Карта»: размер по экрану, сборка порциями по
// времени (без кадров по 100+ мс), отмена и полный проход по клеткам.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FakeCanvas, FakeImage, installCanvasFakes } from "@/test/canvasFakes";
import { gridOrigin } from "../hexGeometry";
import { atlasSide, runSliced, startAtlas } from "./atlasBuild";
import { fitCells, seenCells } from "./terrainGeometry";

describe("atlasSide", () => {
  it("1.5 screens of device pixels, density capped at 2, bounded 768..2048", () => {
    expect(atlasSide(440, 2.75)).toBe(1344); // Xiaomi 13T: 7 MB instead of 16 MB
    expect(atlasSide(393, 3)).toBe(1216);
    expect(atlasSide(320, 1)).toBe(768);
    expect(atlasSide(1440, 2)).toBe(2048);
    expect(atlasSide(NaN, NaN)).toBe(768);
  });
});

describe("runSliced", () => {
  function clock() {
    let t = 0;
    const queue: Array<() => void> = [];
    return {
      now: () => t,
      advance: (ms: number) => (t += ms),
      schedule: (run: () => void) => queue.push(run),
      frame: () => queue.shift()?.(),
      get pending() {
        return queue.length;
      },
    };
  }
  it("stops a slice when the budget is spent and resumes next frame", () => {
    const c = clock();
    const seen: number[] = [];
    const slices: number[] = [];
    let done = false;
    runSliced(
      100,
      (i) => {
        seen.push(i);
        c.advance(0.5);
      },
      {
        budgetMs: 8,
        now: c.now,
        schedule: c.schedule,
        onSlice: (n) => slices.push(n),
        onDone: () => (done = true),
      },
    );
    expect(seen).toEqual([]); // nothing runs synchronously
    c.frame();
    expect(slices).toEqual([16]); // 16 steps × 0.5 ms = budget
    while (c.pending) c.frame();
    expect(done).toBe(true);
    expect(seen).toEqual([...Array(100).keys()]);
  });
  it("cancel stops further slices; zero cells finish at once", () => {
    const c = clock();
    let steps = 0;
    let done = false;
    const stop = runSliced(
      1000,
      () => {
        steps++;
        c.advance(1);
      },
      { budgetMs: 4, now: c.now, schedule: c.schedule, onDone: () => (done = true) },
    );
    c.frame();
    stop();
    while (c.pending) c.frame();
    expect(steps).toBe(16);
    expect(done).toBe(false);
    let empty = false;
    runSliced(
      0,
      () => {
        throw new Error("no cells");
      },
      { budgetMs: 4, now: c.now, schedule: c.schedule, onDone: () => (empty = true) },
    );
    c.frame();
    expect(empty).toBe(true);
  });
});

describe("startAtlas", () => {
  const raf = globalThis.requestAnimationFrame;
  const queue: FrameRequestCallback[] = [];
  beforeAll(() => {
    installCanvasFakes();
    globalThis.requestAnimationFrame = (cb) => queue.push(cb);
    globalThis.cancelAnimationFrame = () => {};
  });
  afterAll(() => {
    globalThis.requestAnimationFrame = raf;
  });
  it("draws every explored cell with its terrain tile, as before", () => {
    const { centerQ, c0q } = gridOrigin(10);
    const keys = ["1,1", "2,1", "1,2", "3,3"];
    const geometry = fitCells(seenCells(new Set(keys), centerQ, c0q), []);
    const surface = new FakeCanvas();
    surface.width = surface.height = 1344;
    let done = false;
    const stop = startAtlas({
      surface: surface as unknown as HTMLCanvasElement,
      geometry,
      terrain: ["grass", "grass", undefined, "sand"],
      images: new Map([
        ["grass", new FakeImage(128, 128) as unknown as HTMLImageElement],
        ["sand", new FakeImage(128, 128) as unknown as HTMLImageElement],
      ]),
      budgetMs: 8,
      onDone: () => (done = true),
    });
    expect(stop).not.toBeNull();
    while (queue.length) queue.shift()?.(0);
    expect(done).toBe(true);
    // Three cells have a tile; the one without terrain is a flat fill (not recorded by the fake).
    expect(surface.ctx?.ops.filter((o) => o.kind === "tile")).toHaveLength(3);
  });
});
