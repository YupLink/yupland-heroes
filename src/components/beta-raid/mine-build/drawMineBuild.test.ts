// Кадр режима стройки: круг — две заливки на кадр (зелёная и красная), сколько
// бы клеток ни было; призрак — картинка шахты полупрозрачно, рамка цветом
// клетки; чертёж — синий пунктир и бледная шахта. Без теней (ПРАВИЛА §9).
import { afterEach, describe, expect, it } from "vitest";
import { BUILD_COLOR, drawMineBuild } from "./drawMineBuild";
import * as st from "./mineBuildStore";
import { mineArtKey } from "@/lib/mineArt";

function fakeCtx() {
  const log: string[] = [];
  const g = {
    globalAlpha: 1,
    lineWidth: 1,
    fillStyle: "",
    strokeStyle: "",
    shadowBlur: 0,
    beginPath: () => log.push("begin"),
    moveTo: () => {},
    lineTo: () => {},
    closePath: () => {},
    fill: () => log.push(`fill ${g.fillStyle}`),
    stroke: () => log.push(`stroke ${g.strokeStyle}`),
    fillRect: () => log.push(`rect a=${g.globalAlpha}`),
    drawImage: () => log.push(`img a=${g.globalAlpha}`),
    setLineDash: (d: number[]) => log.push(`dash ${d.length}`),
  };
  return { g, log };
}

const scene = (g: unknown, images = new Map<string, HTMLImageElement>()) => ({
  g: g as CanvasRenderingContext2D,
  scale: 1,
  toPixel: (q: number, r: number) => ({ x: q * 10, y: r * 10 }),
  images,
});

let detach: (() => void) | null = null;
afterEach(() => {
  detach?.();
  detach = null;
  st.setMinePlan(null);
});

describe("кадр режима стройки", () => {
  it("вне режима и без чертежа — ничего", () => {
    const { g, log } = fakeCtx();
    drawMineBuild(scene(g));
    expect(log).toEqual([]);
  });

  it("круг: одна зелёная и одна красная заливка; призрак — 60 %, рамка цветом клетки", () => {
    detach = st.attachMineBuild();
    st.requestMineBuild("custom:a", "wood");
    st.aimMineBuild({ q: 0, r: 0 });
    const cells = [
      { q: 0, r: 0, ok: true, reason: null },
      { q: 1, r: 0, ok: true, reason: null },
      { q: 0, r: 1, ok: false, reason: "mineplace.road" },
      { q: -1, r: 1, ok: false, reason: "mineplace.busy" },
    ];
    st.setBuildCells({ q: 0, r: 0 }, cells);
    st.moveMineGhost(0, 1);
    const img = { complete: true, naturalWidth: 100, naturalHeight: 120 } as HTMLImageElement;
    const { g, log } = fakeCtx();
    drawMineBuild(scene(g, new Map([["b:building_yYIdx793rM:0", img]])));
    expect(log.filter((x) => x === `fill ${BUILD_COLOR.okFill}`)).toHaveLength(1);
    expect(log.filter((x) => x === `fill ${BUILD_COLOR.badFill}`)).toHaveLength(1);
    expect(log).toContain(`stroke ${BUILD_COLOR.bad}`); // рамка призрака на красной
    expect(log).toContain("img a=0.6");
    expect(g.globalAlpha).toBe(1);
    expect(g.shadowBlur).toBe(0);
  });

  it("призрак на клетке круга — «можно/нельзя поставить» из набора, без своей прозрачности", () => {
    detach = st.attachMineBuild();
    st.requestMineBuild("custom:g", "gold");
    st.aimMineBuild({ q: 0, r: 0 });
    st.setBuildCells({ q: 0, r: 0 }, [
      { q: 0, r: 0, ok: true, reason: null },
      { q: 1, r: 0, ok: false, reason: "mineplace.vein" },
    ]);
    const art = (w: number) =>
      ({ complete: true, naturalWidth: w, naturalHeight: w }) as HTMLImageElement;
    const can = art(256);
    const cannot = art(255);
    const drawn: unknown[] = [];
    const images = new Map([
      [mineArtKey("gold", "can-place"), can],
      [mineArtKey("gold", "cannot-place"), cannot],
    ]);
    const { g, log } = fakeCtx();
    g.drawImage = ((im: unknown) => {
      drawn.push(im);
      log.push(`img a=${g.globalAlpha}`);
    }) as typeof g.drawImage;
    st.moveMineGhost(0, 0);
    drawMineBuild(scene(g, images));
    st.moveMineGhost(1, 0);
    drawMineBuild(scene(g, images));
    expect(drawn).toEqual([can, cannot]);
    expect(log.filter((x) => x.startsWith("img"))).toEqual(["img a=1", "img a=1"]);
    expect(log).toContain(`fill ${BUILD_COLOR.okFill}`); // подсветка круга — как была
  });

  it("чертёж: синий пунктир; картинка шахты ещё едет — без серого прямоугольника", () => {
    st.setMinePlan({ mapId: "m1", q: 3, r: 3, kind: "gold", stackKey: "custom:g", energy: 10 });
    st.setMineBuildMap("floor_2"); // чертёж с другой карты — не рисуем
    const other = fakeCtx();
    drawMineBuild(scene(other.g));
    expect(other.log).toEqual([]);
    st.setMineBuildMap("m1");
    const { g, log } = fakeCtx();
    drawMineBuild(scene(g));
    st.setMineBuildMap(null);
    expect(log).toEqual([
      "begin",
      `fill ${BUILD_COLOR.planFill}`,
      "dash 2",
      `stroke ${BUILD_COLOR.plan}`,
      "dash 0",
    ]);
  });
});
