// Цены ремонта артефактов (владелец, 23.10.2026; §8.72): Common 5 золота, Rare 20,
// Epic 50, Legendary 1 алмаз; цена не зависит от износа; сумма выбранных — золото и
// алмазы отдельно; нехватка — по каждому ресурсу.
import { describe, expect, it } from "vitest";
import {
  ART_REPAIR_PRICE,
  FORGE_TEMPLATE_ID,
  artRepairPrice,
  repairRarity,
  repairShort,
  repairTotal,
} from "./artRepair";
import { ART_LIFE } from "./artWear";

describe("цена ремонта по редкости", () => {
  it("слово владельца", () => {
    expect(artRepairPrice("common")).toEqual({ gold: 5, diamonds: 0 });
    expect(artRepairPrice("rare")).toEqual({ gold: 20, diamonds: 0 });
    expect(artRepairPrice("epic")).toEqual({ gold: 50, diamonds: 0 });
    expect(artRepairPrice("legendary")).toEqual({ gold: 0, diamonds: 1 });
  });
  it("редкости — те же, что у срока службы; регистр не важен, незнакомая — обычная", () => {
    expect(Object.keys(ART_REPAIR_PRICE).sort()).toEqual(Object.keys(ART_LIFE).sort());
    expect(repairRarity(" Epic ")).toBe("epic");
    expect(repairRarity(null)).toBe("common");
    expect(repairRarity("mythic")).toBe("common");
    expect(artRepairPrice(undefined)).toEqual({ gold: 5, diamonds: 0 });
  });
  it("кузница — шаблон building_XOq7FN2NdQ", () => {
    expect(FORGE_TEMPLATE_ID).toBe("building_XOq7FN2NdQ");
  });
});

describe("сумма выбранных", () => {
  it("складывает золото и алмазы отдельно", () => {
    const items = [
      { rarity: "common" },
      { rarity: "rare" },
      { rarity: "epic" },
      { rarity: "legendary" },
      { rarity: "legendary" },
    ];
    expect(repairTotal(items)).toEqual({ gold: 75, diamonds: 2 });
    expect(repairTotal([])).toEqual({ gold: 0, diamonds: 0 });
  });
  it("нехватка — по каждому ресурсу; нет данных о счёте — как ноль", () => {
    const total = { gold: 25, diamonds: 1 };
    expect(repairShort(total, { gold: 25, diamonds: 1 })).toEqual({ gold: false, diamonds: false });
    expect(repairShort(total, { gold: 24, diamonds: 5 })).toEqual({ gold: true, diamonds: false });
    expect(repairShort(total, { gold: 100, diamonds: 0 })).toEqual({ gold: false, diamonds: true });
    expect(repairShort(total, undefined)).toEqual({ gold: true, diamonds: true });
    expect(repairShort({ gold: 0, diamonds: 0 }, undefined)).toEqual({
      gold: false,
      diamonds: false,
    });
  });
});
