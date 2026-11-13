// Управление режимом стройки на телефоне: палец в круге водит заготовку (камера
// стоит), вне круга и двумя пальцами — карта как обычно. Тап по карте в режиме
// ставит призрак; тап по своему чертежу — рядом окно, издалека маршрут
// «дойти и разместить» с ценой постановки.
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type React from "react";
import { R } from "../hexGeometry";

vi.mock("@/server/api/beta-raid/mine-place/mine-plan", () => ({
  getMyMinePlan: async () => null,
  minePlaceCandidates: async () => ({ kind: "wood", center: { q: 0, r: 0 }, cells: [] }),
  removeMinePlan: async () => ({ ok: true }),
}));
vi.mock("@/server/api/beta-raid/mine-place/mine-place", () => ({
  placeMineBlueprint: async () => ({ ok: true }),
}));
vi.mock("@/lib/i18n", () => ({ useLang: () => "ru", useT: () => (k: string) => k }));

const st = await import("./mineBuildStore");
const { useMineBuildGestures } = await import("./useMineBuildGestures");
const { useMineBuild } = await import("./useMineBuild");

let detach: (() => void) | null = null;
afterEach(() => {
  detach?.();
  detach = null;
  st.setMinePlan(null);
});

/** Экранная точка центра клетки: холст 400×400, камера в нуле, зум 1. */
const at = (q: number, r: number) => ({
  clientX: 200 + R * Math.sqrt(3) * (q + r / 2),
  clientY: 200 + R * 1.5 * r,
});

function gestures() {
  const cam = { calls: [] as string[] };
  const h = {
    onPointerDown: () => cam.calls.push("pdown"),
    onPointerMove: () => cam.calls.push("pmove"),
    onPointerUp: () => cam.calls.push("pup"),
    onTouchStart: () => cam.calls.push("tstart"),
    onTouchMove: () => cam.calls.push("tmove"),
    onTouchEnd: () => cam.calls.push("tend"),
  };
  const canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 400 }) };
  let out: ReturnType<typeof useMineBuildGestures> | null = null;
  function Probe() {
    out = useMineBuildGestures(h, {
      canvasRef: { current: canvas as unknown as HTMLCanvasElement },
      offsetRef: { current: { x: 0, y: 0 } },
      scaleRef: { current: 1 },
      grid: { centerQ: 0, c0q: 0 },
    });
    return null;
  }
  renderToStaticMarkup(<Probe />);
  return { g: out! as ReturnType<typeof useMineBuildGestures>, cam };
}

const touch = (...pts: Array<{ clientX: number; clientY: number }>) =>
  ({ touches: pts }) as unknown as React.TouchEvent;

describe("жесты режима стройки", () => {
  it("вне режима — всё камере", () => {
    const { g, cam } = gestures();
    g.onTouchStart(touch(at(0, 0)));
    expect(cam.calls).toEqual(["tstart"]);
  });

  it("палец в круге тянет призрак, камера стоит; за краем — призрак на краю", () => {
    detach = st.attachMineBuild();
    st.requestMineBuild("custom:a", "wood");
    st.aimMineBuild({ q: 0, r: 0 });
    const { g, cam } = gestures();
    g.onTouchStart(touch(at(1, 1)));
    expect(st.getMineBuild()?.ghost).toEqual({ q: 1, r: 1 });
    g.onTouchMove(touch(at(5, 0)));
    expect(st.getMineBuild()?.ghost).toEqual({ q: 2, r: 0 });
    g.onTouchEnd(touch());
    expect(cam.calls).toEqual([]);
  });

  it("палец вне круга и два пальца — камера", () => {
    detach = st.attachMineBuild();
    st.requestMineBuild("custom:a", "wood");
    st.aimMineBuild({ q: 0, r: 0 });
    const { g, cam } = gestures();
    g.onTouchStart(touch(at(4, 0)));
    g.onTouchStart(touch(at(0, 0), at(1, 0)));
    g.onTouchMove(touch(at(0, 0), at(2, 0)));
    expect(cam.calls).toEqual(["tstart", "tstart", "tmove"]);
  });
});

describe("тап по карте", () => {
  type Taps = {
    buildTap: (q: number, r: number) => boolean;
    planTap: (q: number, r: number) => boolean;
  };
  function hook(playerPos: { q: number; r: number }) {
    const approach = vi.fn();
    let taps: Taps | null = null;
    function Probe() {
      taps = useMineBuild({ mapId: "m1", playerPos, energy: 50, approachCell: approach });
      return null;
    }
    renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <Probe />
      </QueryClientProvider>,
    );
    st.setMineBuildMap("m1"); // эффект карты на сервере не бежит — ставим сами
    return { ...(taps! as Taps), approach };
  }
  const plan = { mapId: "m1", stackKey: "custom:d", kind: "diamonds" as const, energy: 20 };
  afterEach(() => st.setMineBuildMap(null));

  it("в режиме — призрак на клетку, ход не начинается; вне режима — мимо", () => {
    const { buildTap, approach } = hook({ q: 0, r: 0 });
    expect(buildTap(1, 0)).toBe(false);
    detach = st.attachMineBuild();
    st.requestMineBuild("custom:a", "wood");
    st.aimMineBuild({ q: 0, r: 0 });
    expect(buildTap(-1, 2)).toBe(true);
    expect(st.getMineBuild()?.ghost).toEqual({ q: -1, r: 2 });
    expect(approach).not.toHaveBeenCalled();
  });

  it("чертёж издалека — маршрут «дойти и разместить» с ценой; чужая клетка — мимо", () => {
    st.setMinePlan({ ...plan, q: 5, r: 0 });
    const { planTap, approach } = hook({ q: 0, r: 0 });
    expect(planTap(4, 0)).toBe(false);
    expect(planTap(5, 0)).toBe(true);
    expect(approach).toHaveBeenCalledWith(5, 0, { kind: "mineplan", q: 5, r: 0, extraCost: 20 });
  });

  it("чертёж рядом — окно, без маршрута; чертёж другой карты — мимо", () => {
    st.setMinePlan({ ...plan, q: 1, r: 0 });
    const { planTap, approach } = hook({ q: 0, r: 0 });
    expect(planTap(1, 0)).toBe(true);
    expect(approach).not.toHaveBeenCalled();
    st.setMinePlan({ ...plan, mapId: "floor_2", q: 1, r: 0 });
    expect(planTap(1, 0)).toBe(false);
  });
});
