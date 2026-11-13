// Полоса службы шахты на холсте: только у шахт с данными и не на отдалении,
// три заливки на кадр (рамки → дорожка → красное), ширина красного — доля
// запаса, сломанная — пустая рамка, над флажком, без теней и save/restore.
import { beforeEach, describe, expect, it } from "vitest";
import { R } from "../hexGeometry";
import { decodeMineLife } from "@/lib/mineLifeBars";
import { setMineBars } from "./mineLifeStore";
import {
  drawMineLifeBars,
  mineBarsFrame,
  queueMineLifeBar,
  type MineBarsFrame,
} from "./drawMineLifeBars";

const H = 3_600_000;
const NOW = Date.parse("2026-10-21T12:00:00Z");

type Op = { op: string; args: number[]; style?: string };

/** Холст-шпион: копит вызовы, заливка запоминает fillStyle и прямоугольники пути. */
function spyCtx() {
  const ops: Op[] = [];
  let path: number[][] = [];
  const fills: Array<{ style: string; rects: number[][] }> = [];
  const strokes: Array<{ style: string; arcs: number[][] }> = [];
  const texts: Array<{ text: string; x: number; y: number }> = [];
  const g = {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    font: "",
    textAlign: "",
    textBaseline: "",
    shadowBlur: 0,
    beginPath: () => {
      path = [];
      ops.push({ op: "beginPath", args: [] });
    },
    rect: (...a: number[]) => path.push(a),
    moveTo: () => undefined,
    arc: (...a: number[]) => path.push(a),
    fill: () => fills.push({ style: String(g.fillStyle), rects: path }),
    stroke: () => strokes.push({ style: String(g.strokeStyle), arcs: path }),
    fillText: (text: string, x: number, y: number) => texts.push({ text, x, y }),
    save: () => ops.push({ op: "save", args: [] }),
    restore: () => ops.push({ op: "restore", args: [] }),
  };
  return { g: g as unknown as CanvasRenderingContext2D, ops, fills, strokes, texts, raw: g };
}

/** «1,1» — «Максимум», полная 12 ч назад → половина; «2,2» — ничья; «3,3» — полная. */
function loadBars(skew = 0): void {
  const wire = { bars: `1,1,2,1,${12 * 3600};2,2;3,3,0,1,0`, serverNow: NOW };
  const { bars } = decodeMineLife(wire);
  setMineBars(bars, skew);
}

function scene(scale: number, frame: MineBarsFrame | null) {
  const spy = spyCtx();
  return { spy, scene: { g: spy.g, scale, bucket: scale * 1.5, mineLife: frame } };
}

describe("mineBarsFrame", () => {
  beforeEach(() => setMineBars(new Map(), 0));

  it("нет данных — кадр без полос", () => {
    expect(mineBarsFrame(1, NOW)).toBeNull();
  });

  it("отдаление < 0,5 — полос нет; 0,5 и ближе — есть", () => {
    loadBars();
    expect(mineBarsFrame(0.45, NOW)).toBeNull();
    expect(mineBarsFrame(0.5, NOW)).not.toBeNull();
  });

  it("время кадра — часы сервера (сдвиг телефона снят)", () => {
    loadBars(600_000);
    expect(mineBarsFrame(1, NOW + 600_000)?.now).toBe(NOW);
  });

  it("очередь чистится в начале каждого кадра", () => {
    loadBars();
    const f = mineBarsFrame(1, NOW)!;
    queueMineLifeBar({ mineLife: f }, { key: "1,1", x: 0, k: 1 }, 0);
    expect(mineBarsFrame(1, NOW)!.out).toHaveLength(0);
  });
});

describe("queueMineLifeBar + drawMineLifeBars", () => {
  beforeEach(() => loadBars());

  it("в очередь — только шахты с полосой; без кадра полос — ничего", () => {
    const f = mineBarsFrame(1, NOW)!;
    queueMineLifeBar({ mineLife: f }, { key: "9,9", x: 0, k: 1 }, 0);
    queueMineLifeBar({ mineLife: null }, { key: "1,1", x: 0, k: 1 }, 0);
    queueMineLifeBar({}, { key: "1,1", x: 0, k: 1 }, 0);
    expect(f.out).toHaveLength(0);
    const { spy, scene: s } = scene(1, f);
    drawMineLifeBars(s);
    expect(spy.fills).toHaveLength(0);
  });

  it("три заливки на кадр на все шахты: рамка, дорожка, красное (+ кружки уровня)", () => {
    const f = mineBarsFrame(1, NOW)!;
    queueMineLifeBar({ mineLife: f }, { key: "1,1", x: 100, k: 1 }, 50);
    queueMineLifeBar({ mineLife: f }, { key: "2,2", x: 300, k: 1 }, 50);
    queueMineLifeBar({ mineLife: f }, { key: "3,3", x: 500, k: 1 }, 50);
    const { spy, scene: s } = scene(1, f);
    drawMineLifeBars(s);
    expect(spy.fills.map((x) => x.style)).toEqual([
      "rgba(8, 11, 18, 0.9)",
      "#3d1619",
      "#e5484d",
      "rgba(8, 11, 18, 0.9)",
    ]);
    expect(spy.fills[0].rects).toHaveLength(3);
    // Старая запись без уровня — уровень 1: кружок у каждой шахты.
    expect(spy.texts.map((x) => x.text)).toEqual(["1", "1", "1"]);
    expect(spy.fills[1].rects).toHaveLength(3);
    // Ничья «2,2» — без красного: пустая рамка.
    expect(spy.fills[2].rects).toHaveLength(2);
    expect(spy.ops.filter((o) => o.op === "save" || o.op === "restore")).toHaveLength(0);
    expect(spy.raw.shadowBlur).toBe(0);
  });

  it("красное — доля запаса от дорожки: половина у «1,1», вся у полной «3,3»", () => {
    const f = mineBarsFrame(1, NOW)!;
    queueMineLifeBar({ mineLife: f }, { key: "1,1", x: 100, k: 1 }, 50);
    queueMineLifeBar({ mineLife: f }, { key: "3,3", x: 500, k: 1 }, 50);
    const { spy, scene: s } = scene(1, f);
    drawMineLifeBars(s);
    const [track1, track3] = spy.fills[1].rects;
    const [red1, red3] = spy.fills[2].rects;
    expect(red1[2]).toBeCloseTo(track1[2] / 2, 6);
    expect(red3[2]).toBeCloseTo(track3[2], 6);
    expect(red1[0]).toBe(track1[0]);
  });

  it("кружок уровня слева от полосы; остров (0) — без кружка; у сломанной — остаётся", () => {
    const wire = { bars: "1,1,0,1,0,3;2,2,0,1,0,0;3,3,2", serverNow: NOW };
    setMineBars(decodeMineLife(wire).bars, 0);
    const f = mineBarsFrame(1, NOW)!;
    queueMineLifeBar({ mineLife: f }, { key: "1,1", x: 100, k: 1 }, 50);
    queueMineLifeBar({ mineLife: f }, { key: "2,2", x: 300, k: 1 }, 50);
    queueMineLifeBar({ mineLife: f }, { key: "3,3", x: 500, k: 1 }, 50);
    const { spy, scene: s } = scene(1, f);
    drawMineLifeBars(s);
    expect(spy.texts.map((x) => x.text)).toEqual(["3", "2"]);
    const bar = spy.fills[0].rects[0];
    expect(spy.texts[0].x).toBeLessThan(bar[0]);
    expect(spy.strokes).toHaveLength(1);
    expect(spy.strokes[0].arcs).toHaveLength(2);
  });

  it("тает со временем: через 6 ч у «Максимума» с половины — четверть", () => {
    const later = mineBarsFrame(1, NOW + 6 * H)!;
    queueMineLifeBar({ mineLife: later }, { key: "1,1", x: 0, k: 1 }, 0);
    expect(later.out[3]).toBeCloseTo(0.25, 9);
  });

  it("над флажком шахты и по центру постройки; блок (k = 2) — шире вдвое", () => {
    const f = mineBarsFrame(1, NOW)!;
    queueMineLifeBar({ mineLife: f }, { key: "3,3", x: 100, k: 1 }, 40);
    queueMineLifeBar({ mineLife: f }, { key: "3,3", x: 400, k: 2 }, 40);
    const { spy, scene: s } = scene(1, f);
    drawMineLifeBars(s);
    const [one, two] = spy.fills[0].rects;
    // Низ полосы выше верха флажка (крыша − 0,441R·k).
    expect(one[1] + one[3]).toBeLessThan(40 - R * 0.441);
    expect(two[1] + two[3]).toBeLessThan(40 - R * 0.441 * 2);
    expect(one[0] + one[2] / 2).toBeCloseTo(100, 0);
    // Ширины выровнены по пикселю устройства (dpr 1,5) — расхождение не больше пикселя.
    expect(Math.abs(two[2] - one[2] * 2)).toBeLessThanOrEqual(1 / 1.5 + 1e-9);
  });

  it("высота — в css-пикселях: на отдалении 0,5 полоса не тоньше, чем вблизи", () => {
    for (const scale of [0.5, 1, 3]) {
      const f = mineBarsFrame(scale, NOW)!;
      queueMineLifeBar({ mineLife: f }, { key: "3,3", x: 0, k: 1 }, 0);
      const { spy, scene: s } = scene(scale, f);
      drawMineLifeBars(s);
      expect(spy.fills[0].rects[0][3] * scale).toBeCloseTo(6, 0);
    }
  });

  it("почти пустая, но работающая — хотя бы пиксель красного", () => {
    const f = mineBarsFrame(1, NOW + 11.99 * H)!;
    queueMineLifeBar({ mineLife: f }, { key: "1,1", x: 0, k: 1 }, 0);
    const { spy, scene: s } = scene(1, f);
    drawMineLifeBars(s);
    expect(spy.fills[2].rects[0][2]).toBeGreaterThanOrEqual(1);
  });
});
