// Виды грибов (владелец, 22.10.2026): числа владельца, узнавание вида по
// настройке клетки и по стопке рюкзака, гриб — не шахта v2 (золотой гриб не
// получает режимов и запаса службы), облик гриба рисуется втрое меньше.
import { describe, expect, it } from "vitest";
import {
  MUSHROOMS,
  MUSHROOM_DRAW_SCALE,
  MUSHROOM_SPAWN_DEFAULT,
  isMushroomConfig,
  isMushroomSkinKey,
  mushroomKindOf,
  mushroomKindOfStack,
  mushroomStackKey,
} from "./mushroomKinds";
import { mineV2Of } from "./mineV2";
import { cellMineConfig } from "./mineConfig";
import { dmineNameOr, isDaraiMineConfig } from "./daraiMine";

describe("числа владельца", () => {
  it("добыча в час, жизнь и лимиты на все миры", () => {
    expect(MUSHROOMS.darai).toMatchObject({ yield: 10_000, lifeHours: 168, limit: 100 });
    expect(MUSHROOMS.gold).toMatchObject({
      resource: "gold",
      yield: 1,
      lifeHours: 168,
      limit: 200,
    });
    expect(MUSHROOMS.diamonds).toMatchObject({
      resource: "diamonds",
      yield: 1,
      lifeHours: 72,
      limit: 10,
    });
  });

  it("редкость: алмазный реже DARAI, DARAI реже золотого (на клетке встаёт более редкий)", () => {
    expect(MUSHROOMS.diamonds.rarity).toBeLessThan(MUSHROOMS.darai.rarity);
    expect(MUSHROOMS.darai.rarity).toBeLessThan(MUSHROOMS.gold.rarity);
  });

  it("шансы по умолчанию: рядом с жилой — в 10 раз меньше", () => {
    expect(MUSHROOM_SPAWN_DEFAULT).toEqual({
      gold: 0.01,
      darai: 0.001,
      diamonds: 0.002,
      near: 0.1,
    });
  });
});

describe("вид по настройке клетки", () => {
  it("метка mushroom; прежний DARAI без метки — по токену", () => {
    expect(mushroomKindOf({ resource: "gold", mushroom: "gold", yield: 1 })).toBe("gold");
    expect(mushroomKindOf({ resource: "diamonds", mushroom: "diamonds" })).toBe("diamonds");
    expect(mushroomKindOf({ resource: "token", token: "Darai" })).toBe("darai");
    expect(isDaraiMineConfig({ resource: "token", token: "DARAI" })).toBe(true);
    expect(isDaraiMineConfig({ resource: "gold", mushroom: "gold" })).toBe(false);
  });

  it("золотая шахта, пыль, пустое — не гриб", () => {
    expect(isMushroomConfig({ resource: "gold", yield: 1 })).toBe(false);
    expect(isMushroomConfig({ resource: "token", token: "magicdust" })).toBe(false);
    expect(isMushroomConfig({ mushroom: "silver" })).toBe(false);
    expect(isMushroomConfig(null)).toBe(false);
  });

  it("золотой гриб — не шахта v2: ни режимов, ни запаса; добыча — из настройки", () => {
    const cfg = { resource: "gold", yield: 1, captureCost: 5, mushroom: "gold" };
    expect(mineV2Of(cfg)).toBeNull();
    expect(mineV2Of({ resource: "gold" })).toBe("gold");
    expect(cellMineConfig(cfg, null)).toMatchObject({ resource: "gold", yield: 1 });
    expect(
      cellMineConfig({ ...cfg, resource: "diamonds", mushroom: "diamonds" }, null),
    ).toMatchObject({
      resource: "diamonds",
      yield: 1,
    });
  });
});

describe("стопка рюкзака", () => {
  it("своя ячейка на вид; прежние dmine:<id> — DARAI; не гриб — null", () => {
    expect(mushroomStackKey("gold")).toBe("dmine:gold");
    expect(mushroomKindOfStack("dmine:diamonds")).toBe("diamonds");
    expect(mushroomKindOfStack("dmine:darai")).toBe("darai");
    expect(mushroomKindOfStack("dmine:dm_abc")).toBe("darai");
    expect(mushroomKindOfStack("dmine:")).toBeNull();
    expect(mushroomKindOfStack("boss:rbt_1")).toBeNull();
  });

  it("имя ячейки — по виду на языке игрока", () => {
    expect(dmineNameOr("dmine:gold", "x", "ru")).toBe("Золотой гриб");
    expect(dmineNameOr("dmine:gold", "x", "en")).toBe("Gold Mushroom");
    expect(dmineNameOr("dmine:diamonds", "x", "en")).toBe("Diamond Mushroom");
    expect(dmineNameOr("dmine:darai", "x", "en")).toBe("DARAI Mushroom");
  });
});

describe("на карте втрое меньше", () => {
  it("облик гриба (skin:bskin_dm_*) — масштаб 1/3; прочие постройки — нет", () => {
    expect(MUSHROOM_DRAW_SCALE).toBeCloseTo(1 / 3);
    for (const k of ["skin:bskin_dm_mushroom", "skin:bskin_dm_gold", "skin:bskin_dm_diamonds"])
      expect(isMushroomSkinKey(k)).toBe(true);
    expect(isMushroomSkinKey("skin:bskin_temple")).toBe(false);
    expect(isMushroomSkinKey("building_3arAnV9ajZ")).toBe(false);
  });
});
