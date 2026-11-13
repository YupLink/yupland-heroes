// Вещь в руке (handStore): «В руку» без карты ждёт её, с картой — сразу; земля и
// динамит берутся, прочее — нет; отметки живут, пока клетка годна; ушли с карты —
// рука свободна.
import { describe, expect, it } from "vitest";
import {
  addMark,
  attachHand,
  clearMarks,
  dropHand,
  getHand,
  getQuick,
  handAt,
  handKindOf,
  isMarked,
  muteTap,
  onHandStart,
  requestHand,
  runHand,
  setHandCells,
  setHandRunner,
  setQuick,
  setSpot,
  tapMuted,
  toggleMark,
  unmark,
  type HandCell,
} from "./handStore";

const LAND = "land:terrain_grass";
const RED = "custom:cst_cpsl1cy0hpd7";
const cell = (q: number, r: number, ok = true, cost = 0): HandCell => ({
  dq: q - 10,
  dr: r - 5,
  q,
  r,
  ok,
  reason: ok ? null : "land.same",
  hit: null,
  cost,
});

describe("вещь в руке", () => {
  it("в руку берутся земля и динамит, остальное — нет", () => {
    expect(handKindOf(LAND)).toBe("land");
    expect(handKindOf(RED)).toBe("dynamite");
    expect(handKindOf("dmine:gold")).toBe("mushroom");
    expect(handKindOf("dmine:darai")).toBe("mushroom");
    expect(handKindOf("custom:cst_other")).toBeNull();
    expect(handKindOf("tool:axe")).toBeNull();
  });

  it("карты нет — просьба ждёт; карту открыли — вещь в руке; ушли — рука пуста", () => {
    expect(requestHand(LAND)).toBe(false);
    expect(getHand()).toBeNull();
    const detach = attachHand();
    expect(getHand()).toMatchObject({ kind: "land", stackKey: LAND });
    detach();
    expect(getHand()).toBeNull();
  });

  it("с картой — сразу; окна героя закрываются; круг — только своей стопки", () => {
    const detach = attachHand();
    let closed = 0;
    const off = onHandStart(() => closed++);
    expect(requestHand(RED)).toBe(true);
    expect(closed).toBe(1);
    expect(getHand()?.kind).toBe("dynamite");
    expect(handAt(11, 5)).toBeNull(); // круг ещё не пришёл
    setHandCells(RED, [cell(11, 5), cell(12, 5, false)]);
    expect(handAt(11, 5)?.ok).toBe(true);
    expect(handAt(20, 20)).toBeNull(); // дальше круга — обычный тап
    setHandCells(LAND, []); // чужой круг не принимаем
    expect(handAt(11, 5)).not.toBeNull();
    dropHand();
    expect(handAt(11, 5)).toBeNull();
    off();
    detach();
  });

  it("отметки: тап ставит и снимает, кисть только ставит, негодные уходят с новым кругом", () => {
    const detach = attachHand();
    requestHand(LAND);
    setHandCells(LAND, [cell(11, 5), cell(12, 5), cell(13, 5)]);
    toggleMark({ q: 11, r: 5 });
    addMark({ q: 12, r: 5 });
    addMark({ q: 12, r: 5 });
    expect(getHand()?.marks).toHaveLength(2);
    toggleMark({ q: 11, r: 5 });
    expect(isMarked(11, 5)).toBe(false);
    addMark({ q: 13, r: 5 });
    // 12,5 положили — теперь там та же земля: отметка уходит сама.
    setHandCells(LAND, [cell(11, 5), cell(12, 5, false), cell(13, 5)]);
    expect(getHand()?.marks).toEqual([{ q: 13, r: 5 }]);
    unmark([{ q: 13, r: 5 }]);
    expect(getHand()?.marks).toEqual([]);
    addMark({ q: 11, r: 5 });
    clearMarks();
    expect(getHand()?.marks).toEqual([]);
    setSpot({ q: 11, r: 5 });
    expect(getHand()?.spot).toEqual({ q: 11, r: 5 });
    dropHand();
    detach();
  });

  it("«тап = разместить» запоминается; кисть гасит следующий щелчок; дело — через исполнителя", () => {
    setQuick(true);
    expect(getQuick()).toBe(true);
    setQuick(false);
    expect(getQuick()).toBe(false);
    muteTap(1000);
    expect(tapMuted()).toBe(true);
    const got: unknown[] = [];
    setHandRunner((t) => got.push(t));
    runHand([]);
    runHand([{ q: 1, r: 2 }]);
    expect(got).toEqual([[{ q: 1, r: 2 }]]);
    setHandRunner(null);
  });
});
