// Поле «Сытость» в редакторе товара: пишет и читает эффект «Сытость» в списке
// бустов, прочие эффекты не трогает.
import { describe, expect, it } from "vitest";
import { otherBoosts, satietyValueOf, withSatiety } from "./boostSatiety";
import type { BoostEffect } from "./boost";

const hp: BoostEffect = { stat: "hp", value: "10", minutes: "20" };

describe("поле «Сытость» товара", () => {
  it("число — эффект «Сытость» рядом с прочими бустами", () => {
    const list = withSatiety([hp], "40");
    expect(list).toEqual([hp, { stat: "satiety", value: "40", minutes: "" }]);
    expect(satietyValueOf(list)).toBe("40");
    expect(otherBoosts(list)).toEqual([hp]);
  });
  it("пусто или 0 — сытости нет; ничего не осталось — обычный товар", () => {
    expect(withSatiety([hp], "")).toEqual([hp]);
    expect(withSatiety([hp], "0")).toEqual([hp]);
    expect(withSatiety([], "")).toBeNull();
  });
  it("повторная правка заменяет прежнее число, а не добавляет второе", () => {
    const first = withSatiety([hp], "40");
    const again = withSatiety(otherBoosts(first), "60");
    expect(again?.filter((e) => e.stat === "satiety")).toEqual([
      { stat: "satiety", value: "60", minutes: "" },
    ]);
  });
});
