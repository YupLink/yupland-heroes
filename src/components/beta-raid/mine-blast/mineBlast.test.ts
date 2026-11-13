// Взрыв шахты: только по событию «mine_blast», вид — из события; лист кадров
// качается, лишь когда клетка разведана и на экране; кадры идут по времени от
// первого нарисованного, один проход; после — ничего; кадр будится к смене
// кадра анимации, а не каждые 16 мс.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { blastCells, handleMineBlast } from "./mineBlastLive";
import { drawMineBlasts } from "./drawMineBlasts";
import {
  BLAST_WAIT_MS,
  addMineBlasts,
  getMineBlasts,
  resetMineBlasts,
  subscribeMineBlasts,
} from "./mineBlastStore";
import { mineBlastKey } from "@/lib/mineArt";
import type { FogView } from "../fogMask";

const sheet = { complete: true, naturalWidth: 800, naturalHeight: 300 } as HTMLImageElement;

class Images extends Map<string, HTMLImageElement> {
  asked: string[] = [];
  override get(key: string) {
    this.asked.push(key);
    return super.get(key);
  }
}

function scene(opts: { images?: Images; seen?: boolean; view?: number } = {}) {
  const calls: number[][] = [];
  const g = { drawImage: (_i: unknown, ...a: number[]) => calls.push(a), shadowBlur: 0 };
  const v = opts.view ?? 500;
  const s = {
    g: g as unknown as CanvasRenderingContext2D,
    toPixel: (q: number, r: number) => ({ x: q * 50, y: r * 50 }),
    images: opts.images ?? new Images([[mineBlastKey("gold"), sheet]]),
    view: { minX: -v, maxX: v, minY: -v, maxY: v },
    seen: { hasIndex: () => opts.seen !== false } as unknown as FogView,
    visible: new Set<number>(),
    revealAll: false,
  };
  return { s, calls, g };
}
const cells = { index: () => 7 };

beforeEach(() => resetMineBlasts());
afterEach(() => {
  resetMineBlasts();
  vi.useRealTimers();
});

describe("событие потока", () => {
  it("чужие события не трогает; «mine_blast» кладёт клетки своего вида", () => {
    expect(handleMineBlast({ type: "built", cells: ["1,1"] })).toBe(false);
    expect(getMineBlasts()).toHaveLength(0);
    const ok = handleMineBlast({
      type: "mine_blast",
      mapId: "world",
      cells: [
        { q: 1, r: 2, kind: "sawmill" },
        { q: 2, r: 2, kind: "other" },
        { q: 1.5, r: 2, kind: "gold" },
        { q: 3, r: 2, kind: "diamonds" },
      ],
    });
    expect(ok).toBe(true);
    expect(getMineBlasts().map((b) => [b.q, b.r, b.kind, b.mapId])).toEqual([
      [1, 2, "wood", "world"],
      [3, 2, "diamonds", "world"],
    ]);
  });

  it("кривые клетки — пусто; та же клетка, пока играет, второй раз не ставится", () => {
    expect(blastCells(null)).toEqual([]);
    expect(blastCells([null, "1,1", { q: 1 }])).toEqual([]);
    expect(addMineBlasts("m", [{ q: 0, r: 0, kind: "gold" }], 0)).toBe(1);
    expect(addMineBlasts("m", [{ q: 0, r: 0, kind: "gold" }], 10)).toBe(0);
  });
});

describe("кадр взрыва", () => {
  it("кадры листа по времени, один проход, потом взрыв уходит", () => {
    addMineBlasts("m", [{ q: 0, r: 0, kind: "gold" }], 0);
    const { s, calls, g } = scene();
    drawMineBlasts(s, cells, "m", 100); // первый кадр — начало отсчёта
    expect(calls[0].slice(0, 4)).toEqual([0, 0, 160, 150]);
    drawMineBlasts(s, cells, "m", 100 + 130); // 130 мс — второй кадр
    expect(calls[1].slice(0, 4)).toEqual([160, 0, 160, 150]);
    drawMineBlasts(s, cells, "m", 100 + 700); // десятый — второй ряд, последний столбец
    expect(calls[2].slice(0, 4)).toEqual([640, 150, 160, 150]);
    drawMineBlasts(s, cells, "m", 100 + 750); // проиграно
    expect(calls).toHaveLength(3);
    expect(getMineBlasts()).toHaveLength(0);
    expect(g.shadowBlur).toBe(0);
  });

  it("кадр — в прямоугольнике шахты на клетке (низ у гекса)", () => {
    addMineBlasts("m", [{ q: 2, r: 1, kind: "gold" }], 0);
    const { s, calls } = scene();
    drawMineBlasts(s, cells, "m", 0);
    const [, , , , x, y, w, h] = calls[0];
    expect(x + w / 2).toBeCloseTo(100);
    expect(y + h).toBeGreaterThan(50 + 28 * 0.55);
    expect(w).toBeGreaterThan(28 * 1.7);
  });

  it("вне экрана или на неразведанном — лист не качаем; не дождался — уходит", () => {
    addMineBlasts("m", [{ q: 100, r: 0, kind: "gold" }], 0);
    const far = scene();
    drawMineBlasts(far.s, cells, "m", 10);
    expect(far.s.images.asked).toEqual([]);
    expect(far.calls).toHaveLength(0);
    resetMineBlasts();
    addMineBlasts("m", [{ q: 0, r: 0, kind: "gold" }], 0);
    const fog = scene({ seen: false });
    drawMineBlasts(fog.s, cells, "m", 10);
    expect(fog.s.images.asked).toEqual([]);
    expect(getMineBlasts()).toHaveLength(1);
    drawMineBlasts(fog.s, cells, "m", BLAST_WAIT_MS + 1);
    expect(getMineBlasts()).toHaveLength(0);
  });

  it("лист ещё едет — загрузка запрошена, кадр не рисуется, взрыв ждёт", () => {
    const loading = { complete: false, naturalWidth: 0 } as HTMLImageElement;
    addMineBlasts("m", [{ q: 0, r: 0, kind: "gold" }], 0);
    const { s, calls } = scene({ images: new Images([[mineBlastKey("gold"), loading]]) });
    drawMineBlasts(s, cells, "m", 50);
    expect(s.images.asked).toEqual([mineBlastKey("gold")]);
    expect(calls).toHaveLength(0);
    expect(getMineBlasts()[0].start).toBe(0);
  });

  it("взрыв другого этажа не рисуется и уходит", () => {
    addMineBlasts("floor_2", [{ q: 0, r: 0, kind: "gold" }], 0);
    const { s, calls } = scene();
    drawMineBlasts(s, cells, "world", 0);
    expect(calls).toHaveLength(0);
    expect(getMineBlasts()).toHaveLength(0);
  });

  it("будит кадр к смене кадра анимации", () => {
    vi.useFakeTimers();
    const woke = vi.fn();
    const stop = subscribeMineBlasts(woke);
    addMineBlasts("m", [{ q: 0, r: 0, kind: "gold" }], 0);
    expect(woke).toHaveBeenCalledTimes(1); // пришёл — один кадр
    const { s } = scene();
    drawMineBlasts(s, cells, "m", 0);
    vi.advanceTimersByTime(119);
    expect(woke).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(woke).toHaveBeenCalledTimes(2);
    stop();
  });
});
