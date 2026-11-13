// Жила в руке (handStore, handTap, drawHand, handLabel): берётся в руку стопкой
// vein:<вид>; клетка под жилу — обычная земля, поэтому тап ведёт героя и даёт кнопку
// на плашке, двойной тап кладёт сразу (отмеченные и эту), «тап = разместить» —
// сразу эту; туман рука не пробивает; на карте зелёные — куда ляжет, красный
// контур — куда нет.
import { describe, expect, it } from "vitest";
import { Gem } from "lucide-react";
import {
  attachHand,
  dropHand,
  handKindOf,
  requestHand,
  setHandCells,
  type HandCell,
} from "./handStore";
import { handTakes, handTakesAt, handTapPlan } from "./handTap";
import { handActLabel, handIcon } from "./handLabel";
import { drawHand } from "./drawHand";
import { BUILD_COLOR } from "../mine-build/drawMineBuild";

const GOLD = "vein:gold";
const vein = { kind: "vein" as const };
const at = (o: Partial<HandCell> = {}): HandCell => ({
  q: 1,
  r: 0,
  dq: 1,
  dr: 0,
  ok: true,
  reason: null,
  cost: 0,
  hit: null,
  ...o,
});

describe("жила в руке: тап", () => {
  it("стопка жилы берётся в руку, чужой вид — нет", () => {
    expect(handKindOf(GOLD)).toBe("vein");
    expect(handKindOf("vein:diamonds")).toBe("vein");
    expect(handKindOf("vein:stone")).toBeNull();
  });

  it("годная клетка: тап — ход и кнопка; двойной — сразу; «тап = разместить» — эту", () => {
    expect(handTapPlan(vein, at(), { double: false, quick: false }).do).toBe("offer");
    expect(handTapPlan(vein, at(), { double: true, quick: false }).do).toBe("now");
    // «Тап = разместить» жилу не кладёт: по этой земле ходят (критик 29.10) — только кнопка.
    expect(handTapPlan(vein, at(), { double: false, quick: true }).do).toBe("offer");
    expect(handTapPlan(vein, at(), { double: true, quick: true }).do).toBe("now");
  });

  it("нельзя, своя клетка или дальше круга — обычный тап, переключатель тоже мимо", () => {
    const bad = at({ ok: false, reason: "vein.taken" });
    expect(handTapPlan(vein, bad, { double: true, quick: true }).do).toBe("pass");
    expect(handTapPlan(vein, at({ dq: 0, dr: 0 }), { double: true, quick: true }).do).toBe("pass");
    expect(handTapPlan(vein, null, { double: false, quick: true }).do).toBe("pass");
  });

  it("рука клетку целиком не берёт — туман остаётся туманом", () => {
    expect(handTakes(vein, at())).toBe(false);
    const detach = attachHand();
    requestHand(GOLD);
    setHandCells(GOLD, [at()]);
    expect(handTakesAt(1, 0)).toBe(false);
    dropHand();
    detach();
  });

  it("надпись — «Разместить ×N» без энергии, значок — камень", () => {
    const t = (k: string, p?: Record<string, string | number>) => (p ? `${k}:${p.n}` : k);
    expect(handActLabel(t, "vein", 1, 0)).toBe("land.place");
    expect(handActLabel(t, "vein", 4, 0)).toBe("land.place_n:4");
    expect(handIcon("vein")).toBe(Gem);
  });
});

describe("жила в руке: круг на карте", () => {
  it("годные — зелёной заливкой, негодные — красным контуром, пустота — без рамки", () => {
    const calls: Array<[string, unknown]> = [];
    const g = {
      set fillStyle(v: unknown) {
        calls.push(["fillStyle", v]);
      },
      set strokeStyle(v: unknown) {
        calls.push(["strokeStyle", v]);
      },
      lineWidth: 1,
      beginPath: () => calls.push(["beginPath", null]),
      moveTo: () => calls.push(["moveTo", null]),
      lineTo: () => {},
      closePath: () => {},
      fill: () => calls.push(["fill", null]),
      stroke: () => calls.push(["stroke", null]),
    } as unknown as CanvasRenderingContext2D;
    const detach = attachHand();
    requestHand(GOLD);
    setHandCells(GOLD, [
      at(),
      at({ q: 2, dq: 2 }),
      at({ q: 3, dq: 3, ok: false, reason: "vein.water" }),
      at({ q: 0, r: 1, dq: 0, dr: 1, ok: false, reason: "vein.no_cell" }),
    ]);
    drawHand({ g, scale: 1, toPixel: (q, r) => ({ x: q * 10, y: r * 10 }) });
    const paths = calls.filter((c) => c[0] === "beginPath").length;
    expect(paths).toBe(2);
    expect(calls).toContainEqual(["fillStyle", BUILD_COLOR.okFill]);
    expect(calls).toContainEqual(["strokeStyle", BUILD_COLOR.ok]);
    expect(calls).toContainEqual(["strokeStyle", BUILD_COLOR.bad]);
    // Два гекса зелёных + один красный: по гексу на клетку.
    expect(calls.filter((c) => c[0] === "moveTo")).toHaveLength(3);
    dropHand();
    detach();
  });
});
