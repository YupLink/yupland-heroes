// Выбор игрока в запрос сделки: героев и артефактов ломбарда — сколько в
// корзине (первые отмеченные), износ — только не нулевой.
import { describe, expect, it } from "vitest";
import type { MarketItemView } from "@/lib/buildingEffect";
import { firstArts, pickPayload } from "./artPay";

const hero = {
  side: "sell",
  kind: "hero",
  refId: "hero_any_rare",
  giveAmount: 1,
} as MarketItemView;
const art = { side: "sell", kind: "art", refId: "art_any_common", giveAmount: 1 } as MarketItemView;

describe("pickPayload", () => {
  it("отмеченные копии героя уходят все — ровно по корзине", () => {
    const pick = { templateId: "hero_A", name: "", count: 3, heroItemIds: ["u1", "u2", "u3"] };
    expect(pickPayload(hero, pick, 3)).toEqual({
      templateId: "hero_A",
      heroItemIds: ["u1", "u2", "u3"],
    });
    // Степпер убавили — уходят первые отмеченные.
    expect(pickPayload(hero, pick, 2).heroItemIds).toEqual(["u1", "u2"]);
  });

  it("артефакт: износ группы едет только не нулевой, копий героя нет", () => {
    expect(pickPayload(art, { templateId: "tpl_a", name: "", count: 2, wear: 100 }, 1)).toEqual({
      templateId: "tpl_a",
      wear: 100,
    });
    expect(pickPayload(art, { templateId: "tpl_a", name: "", count: 2 }, 1)).toEqual({
      templateId: "tpl_a",
    });
  });

  it("артефакты ломбарда: уходят первые отмеченные — ровно по корзине", () => {
    const pick = {
      templateId: "tpl_a",
      name: "",
      count: 4,
      arts: [
        { templateId: "tpl_a", wear: 100, count: 3 },
        { templateId: "tpl_b", wear: 0, count: 1 },
      ],
    };
    expect(pickPayload(art, pick, 4)).toEqual({ templateId: "tpl_a", arts: pick.arts });
    // Степпер убавили до двух — вторая группа не едет, первая урезана.
    expect(pickPayload(art, pick, 2)).toEqual({
      templateId: "tpl_a",
      arts: [{ templateId: "tpl_a", wear: 100, count: 2 }],
    });
    // Позиция берёт по две штуки за единицу — одна единица уносит две.
    expect(pickPayload({ ...art, giveAmount: 2 }, pick, 2).arts).toEqual(pick.arts);
  });
});

describe("firstArts", () => {
  it("режет по порядку, пустые и лишние группы не едут", () => {
    const arts = [
      { templateId: "a", wear: 0, count: 2 },
      { templateId: "b", wear: 0, count: 2 },
    ];
    expect(firstArts(arts, 3)).toEqual([arts[0], { templateId: "b", wear: 0, count: 1 }]);
    expect(firstArts(arts, 0)).toEqual([]);
    expect(firstArts(arts, 10)).toEqual(arts);
  });
});
