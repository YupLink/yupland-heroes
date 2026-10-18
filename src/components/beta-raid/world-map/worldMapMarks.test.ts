// Метки карты мира: у каждого вида своя пара «фигура + цвет», порядок слоёв
// покрывает все виды, а значок легенды — тот же контур, что на холсте.
import { describe, expect, it } from "vitest";
import { WORLD_MARK_KINDS } from "@/lib/raid/worldMapCodec";
import { addMarkPath, markSvgPath, type MarkShape, type PathSink } from "./worldMapMarks";
import { MARK_ORDER, MARK_STYLE, markSize } from "./worldMapMarkStyle";

const SHAPES: MarkShape[] = ["dot", "sq", "tri", "triDown", "diamond", "hex", "ring", "star", "x"];

/** Запись команд холста: какие и сколько. */
function recorder() {
  const calls: string[] = [];
  const pts: Array<[number, number]> = [];
  const sink: PathSink = {
    moveTo: (x, y) => void (calls.push("M"), pts.push([x, y])),
    lineTo: (x, y) => void (calls.push("L"), pts.push([x, y])),
    closePath: () => void calls.push("Z"),
    rect: (x, y) => void (calls.push("R"), pts.push([x, y])),
    arc: (_x, _y, _r, _a, _b, ccw) => void calls.push(ccw ? "a" : "A"),
  };
  return { sink, calls, pts };
}

describe("стиль меток", () => {
  it("у каждого вида свой стиль, пары «фигура + цвет» не повторяются", () => {
    expect(Object.keys(MARK_STYLE).sort()).toEqual([...WORLD_MARK_KINDS].sort());
    const pairs = WORLD_MARK_KINDS.map((k) => `${MARK_STYLE[k].shape}|${MARK_STYLE[k].fill}`);
    expect(new Set(pairs).size).toBe(pairs.length);
    const fills = WORLD_MARK_KINDS.map((k) => MARK_STYLE[k].fill.toLowerCase());
    expect(new Set(fills).size).toBe(fills.length);
    // Клад — единственный крестик, портал — единственное кольцо.
    expect(WORLD_MARK_KINDS.filter((k) => MARK_STYLE[k].shape === "x")).toEqual(["treasure"]);
    expect(WORLD_MARK_KINDS.filter((k) => MARK_STYLE[k].shape === "ring")).toEqual(["portal"]);
  });

  it("порядок слоёв — все виды по разу, клады сверху", () => {
    expect([...MARK_ORDER].sort()).toEqual([...WORLD_MARK_KINDS].sort());
    expect(MARK_ORDER.at(-1)).toBe("treasure");
    expect(MARK_ORDER[0]).toBe("other");
  });

  it("размер метки ограничен с двух сторон", () => {
    expect(markSize(0.1)).toBe(6);
    expect(markSize(100)).toBe(14);
  });
});

describe("фигуры", () => {
  it("многоугольники замкнуты и не выходят далеко за рамку", () => {
    for (const shape of SHAPES) {
      const r = recorder();
      addMarkPath(r.sink, shape, 100, 50, 10);
      expect(r.calls.length).toBeGreaterThan(0);
      for (const [x, y] of r.pts) {
        expect(Math.abs(x - 100)).toBeLessThanOrEqual(6.5);
        expect(Math.abs(y - 50)).toBeLessThanOrEqual(6.5);
      }
      if (!["dot", "ring", "sq"].includes(shape)) expect(r.calls.at(-1)).toBe("Z");
    }
  });

  it("кольцо — круг и дырка против часовой (nonzero её не заливает)", () => {
    const r = recorder();
    addMarkPath(r.sink, "ring", 0, 0, 10);
    expect(r.calls).toEqual(["M", "A", "M", "a"]);
    // Издалека (метка 6–8 px) дырка съела бы цвет — кольцо рисуется кругом.
    const small = recorder();
    addMarkPath(small.sink, "ring", 0, 0, 6);
    expect(small.calls).toEqual(["M", "A"]);
  });

  it("значок легенды — тот же контур строкой SVG", () => {
    expect(markSvgPath("sq", 7, 7, 10)).toBe("M2 2h10v10h-10Z");
    expect(markSvgPath("tri", 7, 7, 10)).toBe("M7 2L12 11.25L2 11.25Z");
    const ring = markSvgPath("ring", 7, 7, 10);
    // Внешний круг по часовой (флаг 1), дырка — против (флаг 0).
    expect(ring).toContain("A5 5 0 1 1 2 7");
    expect(ring).toContain("A2.25 2.25 0 1 0 4.75 7");
    for (const shape of SHAPES) expect(markSvgPath(shape, 7, 7, 10)).toMatch(/^M[^N]*Z$/);
  });
});
