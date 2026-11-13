// Рубка руками (§8.56): только декор, который берёт деревянный или каменный
// топор; цена — энергия топора ×2 (25.10) и 30 сытости; помеха — по данным клиента.
import { describe, expect, it } from "vitest";
import {
  HAND_CHOP_SATIETY,
  handChopEnergy,
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
  it("руками — вдвое дороже топора, никогда не дешевле; сытость 30 — как в таблице сытости", () => {
    expect(handChopEnergy(20)).toBe(40);
    expect(handChopEnergy(10)).toBe(20);
    expect(handChopEnergy(5)).toBe(10);
    expect(handChopEnergy(0)).toBe(0);
    for (const c of [1, 3, 7, 20, 50]) expect(handChopEnergy(c)).toBeGreaterThan(c);
    expect(HAND_CHOP_SATIETY).toBe(30);
    expect(SATIETY_COST.handChop).toBe(HAND_CHOP_SATIETY);
  });

  it("сытости меньше 30 — сытость; энергии меньше 10 — энергия", () => {
    expect(handChopBlock({ energy: 50, satiety: 29, need: 40 })).toBe("satiety");
    expect(handChopBlock({ energy: 39.9, satiety: 30, need: 40 })).toBe("energy");
    expect(handChopBlock({ energy: 5, satiety: 0, need: 40 })).toBe("satiety");
  });

  it("ровно хватает или чисел нет — не мешает", () => {
    expect(handChopBlock({ energy: 40, satiety: 30, need: 40 })).toBeNull();
    expect(handChopBlock({})).toBeNull();
    expect(handChopBlock({ energy: null, satiety: null })).toBeNull();
  });
});
