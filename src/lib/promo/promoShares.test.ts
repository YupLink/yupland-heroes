// Один приз по весам (владелец, 05.11.2026): шанс строки = вес / сумма весов;
// «Ничего» — своя строка; форма и сервер принимают её без количества и объёма.
import { describe, expect, it } from "vitest";
import { promoShares, promoShareText } from "./promoShares";
import { createInput } from "@/server/api/promo/promo-input";
import {
  draftError,
  draftToInput,
  lineOfKind,
} from "@/components/castle-live/promo/admin/promoDraft";

describe("promoShares", () => {
  it("50 + 50 — по половине; 30 + 30 — тоже; 1 + 3 — 25 и 75; мусор — 0", () => {
    expect(promoShares([50, 50])).toEqual([50, 50]);
    expect(promoShares([30, 30])).toEqual([50, 50]);
    expect(promoShares([1, 3])).toEqual([25, 75]);
    expect(promoShares([10, Number.NaN, -1])).toEqual([100, 0, 0]);
    expect(promoShares([])).toEqual([]);
  });
  it("текст — до десятой", () => {
    expect(promoShareText(100 / 3, "ru")).toMatch(/^33,3\s%$/);
    expect(promoShareText(50, "en")).toBe("50 %");
  });
});

describe("«Ничего» в форме и на сервере", () => {
  const nothing = { ...lineOfKind("nothing"), amount: "", budget: "77", chance: "70" };
  const gold = { ...lineOfKind("resource"), amount: "5-10", chance: "30" };

  it("форма: вес есть — строка годна; уходит с количеством 1 и без объёма", () => {
    const d = { code: "", maxUsers: "", lines: [gold, nothing] };
    expect(draftError(d)).toBeNull();
    const input = draftToInput(d, "op_123456");
    expect(input.lines[1]).toEqual({
      kind: "nothing",
      ref: null,
      title: null,
      image: null,
      amount: "1",
      chance: 70,
      budget: null,
    });
    expect(createInput.safeParse(input).success).toBe(true);
  });

  it("одни «Ничего» — не промокод (и в форме, и на сервере)", () => {
    const d = { code: "", maxUsers: "", lines: [nothing] };
    expect(draftError(d)).toBe("promo.err_no_lines");
    const input = draftToInput(d, "op_123456");
    expect(createInput.safeParse(input).success).toBe(false);
  });
});
