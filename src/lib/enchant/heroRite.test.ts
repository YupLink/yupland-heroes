// Правила обряда зачарования героев: «пропадёт» одним полем, шансы для полоски,
// бросок (успех — уходят все; неудача — от min до max, разные, по порядку).
import { describe, expect, it } from "vitest";
import { secureRandomInt } from "@/lib/secureRandom";
import {
  HERO_RITE_NEEDS,
  HERO_RITE_NEXT,
  loseText,
  parseLose,
  riteLoseOk,
  riteKeepsFirst,
  riteOdds,
  rollRite,
} from "./heroRite";

/** Подменная случайность: берёт числа по очереди. */
const seq = (xs: number[]) => {
  const q = [...xs];
  return (min: number, max: number) => {
    const v = q.shift() ?? min;
    if (v < min || v >= max) throw new Error(`rnd ${v} вне [${min}, ${max})`);
    return v;
  };
};

describe("что во что", () => {
  it("редкие → эпический, эпические → легендарный, легендарные → уник; героев от 2 до 10", () => {
    expect(HERO_RITE_NEXT).toEqual({ rare: "epic", epic: "legendary", legendary: "unique" });
    expect(riteKeepsFirst("legendary")).toBe(true);
    expect(riteKeepsFirst("epic")).toBe(false);
    expect(HERO_RITE_NEEDS).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});

describe("«пропадёт при неудаче» — одно поле", () => {
  it("«1», «1-2», «0» — да; больше, чем героев, «2-1», мусор — нет", () => {
    expect(parseLose("1", 3)).toEqual([1, 1]);
    expect(parseLose("1-2", 3)).toEqual([1, 2]);
    expect(parseLose(" 0 ", 3)).toEqual([0, 0]);
    expect(parseLose("1–3", 3)).toEqual([1, 3]);
    expect(parseLose("4", 3)).toBeNull();
    expect(parseLose("2-1", 3)).toBeNull();
    expect(parseLose("-1", 3)).toBeNull();
    expect(parseLose("абв", 3)).toBeNull();
    expect(riteLoseOk(0, 0, 2)).toBe(true);
    expect(riteLoseOk(1.5, 2, 3)).toBe(false);
    expect(loseText(1, 2)).toBe("1–2");
    expect(loseText(1, 1)).toBe("1");
  });
});

describe("полоска шансов", () => {
  it("неудача красная, только если кто-то может пропасть", () => {
    expect(riteOdds({ success: 40, loseMax: 2 })).toEqual({ success: 40, none: 0, destroy: 60 });
    expect(riteOdds({ success: 40, loseMax: 0 })).toEqual({ success: 40, none: 60, destroy: 0 });
  });
});

describe("бросок", () => {
  const rite = { success: 50, loseMin: 1, loseMax: 2 };
  it("успех — уходят все положенные", () => {
    expect(rollRite(rite, 3, seq([0]))).toEqual({ ok: true, lost: [0, 1, 2] });
  });

  it("неудача — сколько (от min до max) и какие, без повторов", () => {
    // 600000 из 1e6 = 60 % ≥ 50 — неудача; k = 2; перестановки: 0↔2, 1↔1.
    expect(rollRite(rite, 3, seq([600_000, 2, 2, 1]))).toEqual({ ok: false, lost: [1, 2] });
  });

  it("«0» — при неудаче все вернутся", () => {
    expect(rollRite({ success: 0, loseMin: 0, loseMax: 0 }, 4, seq([5, 0]))).toEqual({
      ok: false,
      lost: [],
    });
  });

  it("настоящая случайность: число пропавших всегда в рамках, индексы разные", () => {
    for (let i = 0; i < 500; i += 1) {
      const r = rollRite({ success: 30, loseMin: 1, loseMax: 3 }, 5, secureRandomInt);
      if (r.ok) expect(r.lost).toEqual([0, 1, 2, 3, 4]);
      else {
        expect(r.lost.length).toBeGreaterThanOrEqual(1);
        expect(r.lost.length).toBeLessThanOrEqual(3);
        expect(new Set(r.lost).size).toBe(r.lost.length);
        expect(r.lost.every((x) => x >= 0 && x < 5)).toBe(true);
      }
    }
  });
});
