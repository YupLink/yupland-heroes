// Плата за ворота на маршруте: сумма по дверям пути, энергия отдельно,
// двери-стены для маршрута «сквозь двери».
import { describe, expect, it } from "vitest";
import { DEFAULT_PORTAL, type PortalConfig, type PortalPrice } from "@/lib/portal";
import { hardDoorsOf, pathCrossesDoor, pathTolls, splitToll } from "./pathTolls";

const door = (prices: PortalPrice[], extra: Partial<PortalConfig> = {}): PortalConfig => ({
  ...DEFAULT_PORTAL,
  prices,
  ...extra,
});
const gold = (amount: number): PortalPrice => ({ resource: "gold", amount });
const darai = (amount: number): PortalPrice => ({ resource: "token", token: "Darai", amount });
const apple: PortalPrice = {
  resource: "item",
  itemKey: "custom:cst_apple",
  itemName: "Яблоко",
  amount: 100,
};

const path = [
  { q: 0, r: 0 },
  { q: 1, r: 0 },
  { q: 2, r: 0 },
];

describe("pathTolls", () => {
  it("две двери с золотом на пути сливаются в одну строку", () => {
    const tolls = { "0,0": door([gold(50)]), "2,0": door([gold(100)]) };
    expect(pathTolls(path, tolls)).toEqual([gold(150)]);
  });

  it("дверь вне пути не считается; разные валюты — разными строками", () => {
    const tolls = {
      "1,0": door([gold(25), darai(1000)]),
      "9,9": door([gold(999)]),
    };
    expect(pathTolls(path, tolls)).toEqual([gold(25), darai(1000)]);
  });

  it("товар сливается по ключу стека, а не по имени", () => {
    const tolls = { "0,0": door([apple]), "1,0": door([{ ...apple, itemName: "Apple" }]) };
    expect(pathTolls(path, tolls)).toEqual([{ ...apple, amount: 200 }]);
  });

  it("исходные цены не портятся суммированием", () => {
    const cfg = door([gold(50)]);
    pathTolls(path, { "0,0": cfg, "1,0": cfg });
    expect(cfg.prices[0].amount).toBe(50);
  });

  it("без словаря цен — пусто", () => {
    expect(pathTolls(path, undefined)).toEqual([]);
  });
});

describe("splitToll", () => {
  it("энергия уходит в дорогу, остальное остаётся строкой платы", () => {
    const { energy, rest } = splitToll([
      gold(10),
      { resource: "energy", amount: 20 },
      { resource: "energy", amount: 5 },
    ]);
    expect(energy).toBe(25);
    expect(rest).toEqual([gold(10)]);
  });
});

describe("hardDoorsOf", () => {
  const doors = new Set(["0,0", "1,0", "2,0"]);

  it("цены не приехали — повтора сквозь двери нет вовсе", () => {
    expect(hardDoorsOf(doors, undefined, 5)).toBeUndefined();
  });

  it("неизвестная и закрытая по уровню дверь — стена; открытая — нет", () => {
    const tolls = {
      "0,0": door([gold(1)]),
      "1,0": door([], { levelToOn: true, levelTo: 10 }),
    };
    expect([...hardDoorsOf(doors, tolls, 15)!]).toEqual(["1,0", "2,0"]);
    expect([...hardDoorsOf(doors, tolls, 3)!]).toEqual(["2,0"]);
    // Без героя рамка уровня не проходится (сервер спросит «выбери героя»).
    expect([...hardDoorsOf(doors, tolls, null)!]).toEqual(["1,0", "2,0"]);
  });
});

describe("pathCrossesDoor", () => {
  it("видит дверь и в середине, и в конце пути", () => {
    expect(pathCrossesDoor(path, new Set(["1,0"]))).toBe(true);
    expect(pathCrossesDoor(path, new Set(["2,0"]))).toBe(true);
    expect(pathCrossesDoor(path, new Set(["5,5"]))).toBe(false);
    expect(pathCrossesDoor(path, undefined)).toBe(false);
  });
});
