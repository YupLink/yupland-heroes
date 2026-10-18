// Метки происхождения в TS: разбор выдачи и переноса (stack-origin) — урезание
// под количество в порядке «беречь», одна метка целиком, разбор со склада,
// прежний флаг «с мобов», деление переноса между личной и общей полкой.
import { describe, expect, it } from "vitest";
import {
  NO_ORIGIN,
  originAdds,
  originOf,
  originPlus,
  originSplit,
  originWithin,
} from "@/server/api/beta-raid/stack-origin";

describe("числа меток в TS", () => {
  it("originWithin: не больше qty, в порядке «беречь»", () => {
    expect(originWithin(10, { mob: 4, mine: 3, field: 5, loot: 9 })).toEqual({
      mob: 4,
      mine: 3,
      field: 3,
      loot: 0,
    });
    expect(originWithin(3, { mob: 4, mine: 3, field: 5 })).toEqual({
      mob: 3,
      mine: 0,
      field: 0,
      loot: 0,
    });
    expect(originWithin(5, { mob: "2", mine: null, field: -1, loot: "7" })).toEqual({
      mob: 2,
      mine: 0,
      field: 0,
      loot: 3,
    });
    expect(originWithin(0, { mob: 1 })).toEqual(NO_ORIGIN);
  });

  it("originAdds: одна метка целиком, разбор, прежний флаг «с мобов», иначе ничего", () => {
    expect(originAdds(5, "field")).toEqual({ mob: 0, mine: 0, field: 5, loot: 0 });
    expect(originAdds(5, "mine")).toEqual({ mob: 0, mine: 5, field: 0, loot: 0 });
    expect(originAdds(5, "loot")).toEqual({ mob: 0, mine: 0, field: 0, loot: 5 });
    expect(originAdds(5, undefined, true)).toEqual({ mob: 5, mine: 0, field: 0, loot: 0 });
    expect(originAdds(5, { mob: 1, field: 9 })).toEqual({ mob: 1, mine: 0, field: 4, loot: 0 });
    expect(originAdds(5)).toEqual(NO_ORIGIN);
    expect(originAdds(5, null)).toEqual(NO_ORIGIN);
    expect(originAdds(0.000454660540250266, "mob").mob).toBe(0.000454660540250266);
  });

  it("originOf: только известные метки, прочее — безымянное", () => {
    expect(originOf("loot")).toBe("loot");
    expect(originOf("mob")).toBe("mob");
    expect(originOf("bought")).toBeNull();
    expect(originOf(null)).toBeNull();
    expect(originOf(1)).toBeNull();
  });

  it("originSplit: первой части — помеченное, сумма частей = целое", () => {
    const all = { mob: 10, mine: 2, field: 5, loot: 3 };
    const [a, b] = originSplit(all, 13);
    expect(a).toEqual({ mob: 10, mine: 2, field: 1, loot: 0 });
    expect(b).toEqual({ mob: 0, mine: 0, field: 4, loot: 3 });
    expect(originPlus(a, b)).toEqual(all);
    const round = (v: number) => Math.round(v * 1e9) / 1e9;
    const [c, d] = originSplit({ mob: 0.3, mine: 0.1, field: 0.2, loot: 0.15 }, 0.35, round);
    expect(originPlus(c, d, round)).toEqual({ mob: 0.3, mine: 0.1, field: 0.2, loot: 0.15 });
  });
});
