// Доли видов рыбы: сумма всегда сотня, и соседи едут сами.
import { describe, expect, it } from "vitest";
import {
  normalizeFish,
  pickFish,
  setFishPct,
  withFishItem,
  withoutFishItem,
} from "@/lib/raid/fishChances";

const sum = (list: Array<{ pct: number }>): number =>
  Math.round(list.reduce((a, b) => a + b.pct, 0) * 10) / 10;

describe("доли видов", () => {
  it("пустой список — пусто; один вид — сто процентов", () => {
    expect(normalizeFish([])).toEqual([]);
    expect(normalizeFish([{ id: "cst_a", pct: 3 }])).toEqual([{ id: "cst_a", pct: 100 }]);
  });

  it("новый список без долей делится поровну, сумма — сотня", () => {
    const got = normalizeFish([
      { id: "cst_a", pct: 0 },
      { id: "cst_b", pct: 0 },
      { id: "cst_c", pct: 0 },
    ]);
    expect(sum(got)).toBe(100);
    expect(got.map((it) => it.pct)).toEqual([33.4, 33.3, 33.3]);
  });

  it("90 / 7 / 2,5 / 0,5 сохраняются как есть", () => {
    const got = normalizeFish([
      { id: "cst_a", pct: 90 },
      { id: "cst_b", pct: 7 },
      { id: "cst_c", pct: 2.5 },
      { id: "cst_d", pct: 0.5 },
    ]);
    expect(got.map((it) => it.pct)).toEqual([90, 7, 2.5, 0.5]);
  });

  it("сменил 90 на 80 — остальные подросли пропорционально", () => {
    const was = [
      { id: "cst_a", pct: 90 },
      { id: "cst_b", pct: 7 },
      { id: "cst_c", pct: 2.5 },
      { id: "cst_d", pct: 0.5 },
    ];
    const got = setFishPct(was, "cst_a", 80);
    expect(sum(got)).toBe(100);
    expect(got[0].pct).toBe(80);
    // Вдвое больше остатка — вдвое больше у каждого: 7 → 14, 2,5 → 5, 0,5 → 1.
    expect(got.slice(1).map((it) => it.pct)).toEqual([14, 5, 1]);
  });

  it("единственный вид остаётся сотней, сколько ни ставь", () => {
    expect(setFishPct([{ id: "cst_a", pct: 100 }], "cst_a", 30)).toEqual([
      { id: "cst_a", pct: 100 },
    ]);
  });

  it("добавили вид — потеснились все; убрали — его доля разошлась", () => {
    const three = normalizeFish([
      { id: "cst_a", pct: 50 },
      { id: "cst_b", pct: 30 },
      { id: "cst_c", pct: 20 },
    ]);
    const four = withFishItem(three, "cst_d");
    expect(sum(four)).toBe(100);
    expect(four.find((it) => it.id === "cst_d")?.pct).toBe(25);
    const back = withoutFishItem(four, "cst_d");
    expect(sum(back)).toBe(100);
    expect(back.map((it) => it.id)).toEqual(["cst_a", "cst_b", "cst_c"]);
  });

  it("бросок попадает в свой отрезок: 0 — первому, 999 — последнему", () => {
    const items = [
      { id: "cst_a", pct: 90 },
      { id: "cst_b", pct: 9.5 },
      { id: "cst_c", pct: 0.5 },
    ];
    expect(pickFish(items, 0)).toBe("cst_a");
    expect(pickFish(items, 899)).toBe("cst_a");
    expect(pickFish(items, 900)).toBe("cst_b");
    expect(pickFish(items, 995)).toBe("cst_c");
    expect(pickFish(items, 999)).toBe("cst_c");
    expect(pickFish([], 5)).toBeNull();
  });
});
