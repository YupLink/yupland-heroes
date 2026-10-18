// Рубка руками (§8.56): только декор, который берёт деревянный или каменный
// топор; цена — 10 энергии и 30 сытости; помеха кнопки — по данным клиента.
import { describe, expect, it } from "vitest";
import {
  HAND_CHOP_ENERGY,
  HAND_CHOP_SATIETY,
  HAND_CHOP_TOOL_IDS,
  canChopByHand,
  handChopBlock,
} from "./handChop";
import { toolIdsOf } from "./decorTools";
import { SATIETY_COST } from "@/lib/hero/satiety";

const [WOOD, STONE] = ["cst_frxf3xh6mq6g", "cst_g7uwp1syvmng"];

describe("что рубится руками", () => {
  it("деревянный и каменный топор — да, в любом месте списка", () => {
    expect(HAND_CHOP_TOOL_IDS).toEqual([WOOD, STONE]);
    expect(canChopByHand([WOOD])).toBe(true);
    expect(canChopByHand(["cst_iron_axe", STONE])).toBe(true);
  });

  it("другие инструменты и пустой список — нет", () => {
    expect(canChopByHand(["cst_iron_axe", "cst_pick"])).toBe(false);
    expect(canChopByHand([])).toBe(false);
  });

  it("старая настройка (только toolItemId) тоже считается", () => {
    expect(canChopByHand(toolIdsOf({ toolItemId: STONE }))).toBe(true);
    expect(canChopByHand(toolIdsOf({ toolItemIds: ["cst_pick"], toolItemId: WOOD }))).toBe(true);
  });
});

describe("цена и помеха", () => {
  it("10 энергии и 30 сытости — та же, что в таблице сытости", () => {
    expect(HAND_CHOP_ENERGY).toBe(10);
    expect(HAND_CHOP_SATIETY).toBe(30);
    expect(SATIETY_COST.handChop).toBe(HAND_CHOP_SATIETY);
  });

  it("сытости меньше 30 — сытость; энергии меньше 10 — энергия", () => {
    expect(handChopBlock({ energy: 50, satiety: 29 })).toBe("satiety");
    expect(handChopBlock({ energy: 9.9, satiety: 30 })).toBe("energy");
    expect(handChopBlock({ energy: 5, satiety: 0 })).toBe("satiety");
  });

  it("ровно хватает или чисел нет — не мешает", () => {
    expect(handChopBlock({ energy: 10, satiety: 30 })).toBeNull();
    expect(handChopBlock({})).toBeNull();
    expect(handChopBlock({ energy: null, satiety: null })).toBeNull();
  });
});
