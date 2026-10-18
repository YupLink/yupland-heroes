// Торговля и Алхимия героя + ёмкость сумки зелий.
//
// Жалоба владельца 25.09: «у торговца данные будто не суммируются». Причина —
// с артефакта Торговли бралось только основное число, бонусы за расу и
// специализацию терялись (Медуза: Торговля 7 + Единорог +7 + Торговец +7).
import { describe, it, expect } from "vitest";
import { heroAlchemy, heroTrade } from "./heroExtraStats";
import { potionBagCapacity } from "./potionBag";
import type { GearPiece } from "./heroStatSources";

const jellyfish: GearPiece = {
  statType: "Trade",
  statAmount: 7,
  race: "Единорог",
  raceAmount: 7,
  specialization: "Торговец",
  specAmount: 7,
};

const alchemyRing: GearPiece = {
  statType: "Alchemy",
  statAmount: 4,
  race: "Юпик",
  raceAmount: 3,
  specialization: "Ассасин",
  specAmount: 2,
};

describe("Торговля", () => {
  it("Торговец: уровень + артефакт со ВСЕМИ совпавшими бонусами", () => {
    const trade = heroTrade({ spec: "Торговец", race: "Единорог", level: 10, gear: [jellyfish] });
    expect(trade).toBe(10 + 7 + 7 + 7);
  });

  it("чужая раса и спека — только основное число артефакта", () => {
    expect(heroTrade({ spec: "Маг", race: "Юпик", level: 10, gear: [jellyfish] })).toBe(7);
  });

  it("Алхимия с артефакта в Торговлю не идёт", () => {
    expect(heroTrade({ spec: "Торговец", race: "Юпик", level: 5, gear: [alchemyRing] })).toBe(5);
  });
});

describe("Алхимия", () => {
  it("Ассасин: +1 за уровень", () => {
    expect(heroAlchemy({ spec: "Ассасин", race: null, level: 23, gear: [] })).toBe(23);
  });

  it("не Ассасин без артефактов — ноль", () => {
    expect(heroAlchemy({ spec: "Воин", race: null, level: 23, gear: [] })).toBe(0);
  });

  it("артефакт Алхимии: основное число + совпавшие раса и спека", () => {
    const a = heroAlchemy({ spec: "Ассасин", race: "Юпик", level: 10, gear: [alchemyRing] });
    expect(a).toBe(10 + 4 + 3 + 2);
  });

  it("артефакт Алхимии работает и на не-Ассасине (без бонуса спеки)", () => {
    expect(heroAlchemy({ spec: "Маг", race: "Юпик", level: 10, gear: [alchemyRing] })).toBe(7);
  });
});

describe("сумка зелий", () => {
  it("база по редкости: рар 3, эпик 4, лег 5", () => {
    expect(potionBagCapacity({ rarity: "rare", alchemy: 0 })).toBe(3);
    expect(potionBagCapacity({ rarity: "epic", alchemy: 0 })).toBe(4);
    expect(potionBagCapacity({ rarity: "legendary", alchemy: 0 })).toBe(5);
  });

  it("каждые 10 Алхимии — +1 ячейка", () => {
    expect(potionBagCapacity({ rarity: "rare", alchemy: 9 })).toBe(3);
    expect(potionBagCapacity({ rarity: "rare", alchemy: 10 })).toBe(4);
    expect(potionBagCapacity({ rarity: "legendary", alchemy: 35 })).toBe(8);
  });
});

// Повышенные уровни (02.10.2026): «даже если это торговец — торговли не
// начисляется». Сверх обычного потолка — только вложенные очки.
describe("Торговля и Алхимия на повышенных уровнях", () => {
  it("Торговец 25 ур. (рар) — торговля как на 20 + skills.trade", () => {
    const hero = { spec: "Торговец", race: "Единорог", gear: [jellyfish] };
    const at20 = heroTrade({ ...hero, level: 20, rarity: "rare" });
    expect(at20).toBe(20 + 21);
    expect(heroTrade({ ...hero, level: 25, rarity: "rare", skills: { trade: 3 } })).toBe(at20 + 3);
    // Без вложенного — ровно как на 20-м.
    expect(heroTrade({ ...hero, level: 25, rarity: "rare" })).toBe(at20);
  });

  it("очко в Торговлю работает и не у Торговца", () => {
    expect(heroTrade({ spec: "Маг", race: null, level: 24, gear: [], rarity: "rare", skills: { trade: 2 } })).toBe(2);
  });

  it("Ассасин-лег 45 — алхимия как на 40 + skills.alchemy; эпик 25 растёт дальше", () => {
    const a = heroAlchemy({ spec: "Ассасин", race: null, level: 45, gear: [], rarity: "legendary", skills: { alchemy: 4 } });
    expect(a).toBe(40 + 4);
    expect(heroAlchemy({ spec: "Ассасин", race: null, level: 25, gear: [], rarity: "epic" })).toBe(25);
  });
});
