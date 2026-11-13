// Постановка шахты (§8.59.8): ставятся все четыре вида, постройка — те же
// шаблоны, что у нынешних шахт; лесопилке и каменной — 3 дерева или 3 горы
// вокруг, золотой и алмазной — жила своего вида под клеткой (21.10.2026).
import { describe, expect, it } from "vitest";
import { MINE_BLUEPRINT_ITEM } from "@/lib/mineBlueprint";
import {
  MINE_PLACE_BUILDING,
  MINE_PLACE_NEED,
  MINE_PLACE_VEIN,
  PLACEABLE_BLUEPRINTS,
  isPlaceableBlueprint,
  isVeinBlueprint,
  minePlaceConfig,
  minePlaceEnergy,
  MINE_BUILD_RADIUS,
  natureCount,
  natureEnough,
  placeableBlueprintOf,
} from "@/lib/minePlacement";

describe("что можно поставить", () => {
  it("все четыре вида: лесопилка, каменная, золотая и алмазная", () => {
    expect(PLACEABLE_BLUEPRINTS).toEqual(["wood", "stone", "gold", "diamonds"]);
    for (const k of ["wood", "stone", "gold", "diamonds"] as const)
      expect(isPlaceableBlueprint(k)).toBe(true);
    expect(isPlaceableBlueprint(null)).toBe(false);
    expect(isPlaceableBlueprint(undefined)).toBe(false);
  });

  it("узнаёт заготовку по ключу стопки рюкзака", () => {
    expect(placeableBlueprintOf(`custom:${MINE_BLUEPRINT_ITEM.wood}`)).toBe("wood");
    expect(placeableBlueprintOf(MINE_BLUEPRINT_ITEM.stone)).toBe("stone");
    expect(placeableBlueprintOf(`custom:${MINE_BLUEPRINT_ITEM.gold}`)).toBe("gold");
    expect(placeableBlueprintOf(`custom:${MINE_BLUEPRINT_ITEM.diamonds}`)).toBe("diamonds");
    expect(placeableBlueprintOf("custom:cst_apple")).toBeNull();
    expect(placeableBlueprintOf(undefined)).toBeNull();
  });
});

describe("постройка на клетке", () => {
  it("шаблоны нынешних «Лесопилки», «Каменной Шахты», «Золотой» и «Алмазной шахты»", () => {
    expect(MINE_PLACE_BUILDING).toEqual({
      wood: "building_yYIdx793rM",
      stone: "building_IbP4EseH2O",
      gold: "building_UbJz0SbcXB",
      diamonds: "building_JTzVEXzUQH",
    });
  });

  it("настройка клетки: вид, захват по виду (алмаз 20, прочие 10), стандарт добычи", () => {
    expect(minePlaceConfig("wood")).toEqual({ resource: "wood", captureCost: 10, yield: 10 });
    expect(minePlaceConfig("stone")).toEqual({ resource: "stone", captureCost: 10, yield: 1 });
    expect(minePlaceConfig("gold")).toEqual({ resource: "gold", captureCost: 10, yield: 1 });
    expect(minePlaceConfig("diamonds")).toEqual({
      resource: "diamonds",
      captureCost: 20,
      yield: 1,
    });
  });

  it("энергия на постановку = цена захвата вида; радиус чертежа — 2", () => {
    expect(minePlaceEnergy("wood")).toBe(10);
    expect(minePlaceEnergy("stone")).toBe(10);
    expect(minePlaceEnergy("gold")).toBe(10);
    expect(minePlaceEnergy("diamonds")).toBe(20);
    expect(MINE_BUILD_RADIUS).toBe(2);
  });
});

describe("природа вокруг", () => {
  it("лесопилке считаются деревья, каменной — горы; нужно не меньше 3", () => {
    expect(MINE_PLACE_NEED).toBe(3);
    expect(natureEnough("wood", { trees: 3, mountains: 0 })).toBe(true);
    expect(natureEnough("wood", { trees: 2, mountains: 6 })).toBe(false);
    expect(natureEnough("stone", { trees: 6, mountains: 2 })).toBe(false);
    expect(natureEnough("stone", { trees: 0, mountains: 4 })).toBe(true);
  });

  it("мусор из базы — ноль", () => {
    expect(natureCount("wood", { trees: Number.NaN, mountains: 0 })).toBe(0);
    expect(natureCount("stone", { trees: 0, mountains: -2 })).toBe(0);
    expect(natureCount("stone", { trees: 0, mountains: 3.7 })).toBe(3);
  });
});

describe("жила под клеткой", () => {
  it("золотой и алмазной — жила своего вида, лесопилке и каменной — природа", () => {
    expect(isVeinBlueprint("gold")).toBe(true);
    expect(isVeinBlueprint("diamonds")).toBe(true);
    expect(isVeinBlueprint("wood")).toBe(false);
    expect(isVeinBlueprint("stone")).toBe(false);
    expect(MINE_PLACE_VEIN).toEqual({ gold: "gold", diamonds: "diamonds" });
  });
});
