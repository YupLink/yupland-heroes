// Правило прочности (владелец, 28.09): настройка «Износ за удар, %», прочность
// текущей штуки, «сколько можно унести» — изношенная штука из рюкзака не уходит.
import { describe, expect, it } from "vitest";
import {
  durabilityOf,
  hitStack,
  hitStackTimes,
  movableCount,
  toolUsesOf,
  toolWearOf,
  undoHit,
  usesWord,
  wearStep,
} from "./toolWear";

describe("toolWear", () => {
  it("настройка: целое 1…100; пусто, ноль и мусор — «ломается сразу»", () => {
    expect(toolWearOf("25")).toBe(25);
    expect(toolWearOf(25)).toBe(25);
    expect(toolWearOf("12,6")).toBe(13);
    expect(toolWearOf("250")).toBe(100);
    for (const v of ["", " ", "0", "-5", "abc", null, undefined]) expect(toolWearOf(v)).toBeNull();
    expect(wearStep(null)).toBe(100);
    expect(wearStep("25")).toBe(25);
  });

  it("прочность текущей штуки: снято 25 — осталось 75", () => {
    expect(durabilityOf(0)).toBe(100);
    expect(durabilityOf("25")).toBe(75);
    expect(durabilityOf(null)).toBe(100);
  });

  it("25 % ×4 = одна штука; без целой штуки рубить нечем", () => {
    let st = { count: 1, wear: 0 };
    const taken: number[] = [];
    for (let i = 0; i < 4; i++) {
      const hit = hitStack(st, 25)!;
      taken.push(hit.taken);
      st = { count: hit.count, wear: hit.wear };
    }
    expect(st).toEqual({ count: 0, wear: 0 });
    expect(taken).toEqual([25, 25, 25, 25]);
    expect(hitStack(st, 25)).toBeNull();
    expect(hitStack({ count: 0.5, wear: 0 }, 25)).toBeNull();
  });

  it("откат возвращает ровно снятое, через ноль — штука назад", () => {
    expect(undoHit({ count: 2, wear: 50 }, 25)).toEqual({ count: 2, wear: 25 });
    expect(undoHit({ count: 0, wear: 0 }, 10)).toEqual({ count: 1, wear: 90 });
  });

  it("унести можно только целые", () => {
    expect(movableCount({ count: 3, wear: 25 })).toBe(2);
    expect(movableCount({ count: 1, wear: 75 })).toBe(0);
    expect(movableCount({ count: 3, wear: 0 })).toBe(3);
  });
});

describe("«N использований» в админке (владелец, 29.09)", () => {
  it("ровно столько ударов, сколько штука выдерживает: ceil(100 / износ); пусто — один", () => {
    expect(toolUsesOf(25)).toBe(4);
    // Ломается на ударе, где износ дошёл до 100 %: 30+30+30+30 — четвёртый.
    expect(toolUsesOf(30)).toBe(4);
    expect(toolUsesOf(33)).toBe(4);
    expect(toolUsesOf(34)).toBe(3);
    expect(toolUsesOf(100)).toBe(1);
    expect(toolUsesOf(1)).toBe(100);
    expect(toolUsesOf(null)).toBe(1);
    expect(toolUsesOf("")).toBe(1);
  });

  it("совпадает с тем, сколько ударов реально выдерживает штука (hit)", () => {
    for (const wear of [1, 7, 25, 30, 33, 34, 50, 99, 100]) {
      let s: { count: number; wear: number } | null = { count: 1, wear: 0 };
      let hits = 0;
      while (s && s.count > 0 && hits < 200) {
        s = hitStack(s, wear);
        hits++;
      }
      expect(hits, `износ ${wear}`).toBe(toolUsesOf(wear));
    }
  });

  it("слово по числу", () => {
    expect([1, 2, 5, 11, 21, 22, 100].map((n) => usesWord(n))).toEqual([
      "использование",
      "использования",
      "использований",
      "использований",
      "использование",
      "использования",
      "использований",
    ]);
  });
});

describe("k ударов разом (рыбалка, §8.35)", () => {
  /** k раз hitStack — эталон: сколько выдержала стопка и что от неё осталось. */
  function byOne(s0: { count: number; wear: number }, step: number, k: number) {
    let s = { ...s0 };
    let hits = 0;
    for (let i = 0; i < k; i++) {
      const next = hitStack(s, step);
      if (!next) break;
      s = { count: next.count, wear: next.wear };
      hits++;
    }
    return { ...s, hits };
  }

  it("ровно как k одиночных ударов — на всех сочетаниях", () => {
    let checked = 0;
    for (const step of [1, 7, 25, 30, 33, 34, 50, 99, 100])
      for (const count of [0, 0.5, 1, 1.5, 2, 3, 7])
        for (const wear of [0, 10, 25, 50, 75, 99])
          for (const k of [1, 2, 3, 4, 5, 9, 50, 120]) {
            if (count < 1 && wear > 0) continue;
            const one = byOne({ count, wear }, step, k);
            const all = hitStackTimes({ count, wear }, step, k);
            expect(
              { count: all.count, wear: all.wear, hits: all.hits },
              `${step}/${count}/${wear}/${k}`,
            ).toEqual(one);
            checked++;
          }
    expect(checked).toBeGreaterThan(2000);
  });

  it("сломанных штук — сколько ушло из стопки; без целой штуки — ни удара", () => {
    expect(hitStackTimes({ count: 3, wear: 50 }, 25, 7)).toEqual({
      count: 1,
      wear: 25,
      hits: 7,
      broken: 2,
    });
    expect(hitStackTimes({ count: 1, wear: 50 }, 25, 7)).toEqual({
      count: 0,
      wear: 0,
      hits: 2,
      broken: 1,
    });
    expect(hitStackTimes({ count: 0.5, wear: 0 }, 25, 3)).toEqual({
      count: 0.5,
      wear: 0,
      hits: 0,
      broken: 0,
    });
  });
});
