// Ход режима стройки (mineBuildStore): «Поставить» без карты ждёт её; круг
// приходит к клетке героя; призрак водится только по кругу; опоздавший круг
// другой клетки не применяется; ✗ и уход с карты выключают режим.
import { afterEach, describe, expect, it } from "vitest";
import * as st from "./mineBuildStore";

const cells = (center: { q: number; r: number }, okAt: string[]) =>
  [
    [0, 0],
    [1, 0],
    [0, 1],
    [-1, 1],
    [-1, 0],
    [0, -1],
    [1, -1],
  ].map(([dq, dr]) => {
    const q = center.q + dq;
    const r = center.r + dr;
    const ok = okAt.includes(`${q},${r}`);
    return { q, r, ok, reason: ok ? null : "mineplace.road" };
  });

let detach: (() => void) | null = null;
afterEach(() => {
  detach?.();
  detach = null;
  st.exitMineBuild();
  st.setMinePlan(null);
});

describe("вход в режим", () => {
  it("карты нет — просьба ждёт и включается, когда карта открылась", () => {
    expect(st.requestMineBuild("custom:cst_mine_bp_wood", "wood")).toBe(false);
    expect(st.getMineBuild()).toBeNull();
    detach = st.attachMineBuild();
    expect(st.getMineBuild()).toMatchObject({ stackKey: "custom:cst_mine_bp_wood", kind: "wood" });
  });

  it("начало режима — один сигнал окнам героя (закрыться), призрак его не повторяет", () => {
    detach = st.attachMineBuild();
    let n = 0;
    const off = st.onMineBuildStart(() => n++);
    st.requestMineBuild("custom:a", "wood");
    st.aimMineBuild({ q: 0, r: 0 });
    st.moveMineGhost(1, 0);
    expect(n).toBe(1);
    st.exitMineBuild();
    st.requestMineBuild("custom:a", "wood");
    off();
    expect(n).toBe(2);
  });

  it("карта открыта — сразу; уход с карты выключает режим", () => {
    detach = st.attachMineBuild();
    let n = 0;
    const off = st.subscribeMineBuild(() => n++);
    expect(st.requestMineBuild("custom:a", "stone")).toBe(true);
    expect(n).toBe(1);
    st.startMineBuild("custom:a", "stone"); // повторное «Поставить» той же заготовки
    expect(n).toBe(1);
    off();
    detach();
    detach = null;
    expect(st.getMineBuild()).toBeNull();
  });
});

describe("призрак и круг", () => {
  it("клетка героя → призрак рядом; пришёл круг → на зелёную; палец — по кругу", () => {
    detach = st.attachMineBuild();
    st.requestMineBuild("custom:a", "wood");
    st.aimMineBuild({ q: 10, r: 5 });
    expect(st.getMineBuild()?.ghost).toEqual({ q: 11, r: 5 });
    expect(st.ghostCandidate()).toBeNull(); // круга ещё нет — без цвета
    st.setBuildCells({ q: 10, r: 5 }, cells({ q: 10, r: 5 }, ["10,6"]));
    expect(st.getMineBuild()?.ghost).toEqual({ q: 10, r: 6 });
    expect(st.ghostCandidate()?.ok).toBe(true);
    st.moveMineGhost(11, 5);
    expect(st.ghostCandidate()).toMatchObject({ ok: false, reason: "mineplace.road" });
    st.moveMineGhost(30, 5); // палец далеко — призрак на краю круга
    expect(st.getMineBuild()?.ghost).toEqual({ q: 12, r: 5 });
  });

  it("сдвинутый игроком призрак круг не переставляет; круг чужой клетки — мимо", () => {
    detach = st.attachMineBuild();
    st.requestMineBuild("custom:a", "wood");
    st.aimMineBuild({ q: 0, r: 0 });
    st.moveMineGhost(-1, 1);
    st.setBuildCells({ q: 0, r: 0 }, cells({ q: 0, r: 0 }, ["1,0"]));
    expect(st.getMineBuild()?.ghost).toEqual({ q: -1, r: 1 });
    st.aimMineBuild({ q: 1, r: 0 }); // герой шагнул — круг заново
    expect(st.getMineBuild()?.cells).toBeNull();
    // Ответ про прежнюю клетку не применён и сказан «нет» — экран спросит заново.
    expect(st.setBuildCells({ q: 0, r: 0 }, cells({ q: 0, r: 0 }, []))).toBe(false);
    expect(st.getMineBuild()?.cells).toBeNull();
    expect(st.setBuildCells({ q: 1, r: 0 }, cells({ q: 1, r: 0 }, []))).toBe(true);
  });

  it("✗ — режима нет; чертёж «✓» — слушатели ведут к нему", () => {
    detach = st.attachMineBuild();
    st.requestMineBuild("custom:a", "gold");
    st.exitMineBuild();
    expect(st.getMineBuild()).toBeNull();
    const seen: unknown[] = [];
    const off = st.subscribePlanCreated((p) => seen.push(p));
    const plan = {
      mapId: "m1",
      q: 3,
      r: 4,
      kind: "gold" as const,
      stackKey: "custom:a",
      energy: 10,
    };
    st.notePlanCreated(plan);
    off();
    expect(seen).toEqual([plan]);
    expect(st.getMinePlan()).toBe(plan);
    st.setMinePlan({ ...plan }); // тот же чертёж новым объектом — без перерисовки
    expect(st.getMinePlan()).toBe(plan);
  });

  it("чертёж — только на своей карте", () => {
    st.setMinePlan({ mapId: "m1", q: 3, r: 4, kind: "wood", stackKey: "custom:w", energy: 10 });
    st.setMineBuildMap("floor_2");
    expect(st.planOnMap()).toBeNull();
    st.setMineBuildMap("m1");
    expect(st.planOnMap()?.q).toBe(3);
    st.setMineBuildMap(null);
  });
});
