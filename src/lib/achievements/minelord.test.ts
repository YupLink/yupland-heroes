// «Хозяин шахт»: DARAI гриба — очко за каждые 1 000 (владелец 22.10.2026), прочее — 1 к 1.
import { describe, expect, it } from "vitest";
import { minelordCredit } from "@/lib/achievements/minelord";

describe("minelordCredit", () => {
  it("гриб DARAI — очко за 1 000, с меткой и без (прежняя DARAI-шахта), регистр не важен", () => {
    const mushroom = { resource: "token", token: "Darai", yield: 10000, mushroom: "darai" };
    expect(minelordCredit(mushroom, 10000)).toBe(10);
    expect(minelordCredit({ resource: "token", token: "Darai", yield: 500000 }, 500000)).toBe(500);
    expect(minelordCredit({ resource: "token", token: "DARAI" }, 20000)).toBe(20);
  });

  it("DARAI: остаток меньше 1 000 в сборе — вниз, ноль и минус — ноль", () => {
    const cfg = { resource: "token", token: "Darai", mushroom: "darai" };
    expect(minelordCredit(cfg, 2999)).toBe(2);
    expect(minelordCredit(cfg, 999)).toBe(0);
    expect(minelordCredit(cfg, 0)).toBe(0);
    expect(minelordCredit(cfg, -5000)).toBe(0);
  });

  it("шахты v2, золотой и алмазный грибы, энергия, пыль — всё собранное", () => {
    expect(minelordCredit({ resource: "wood", yield: 10 }, 30)).toBe(30);
    expect(minelordCredit({ resource: "gold", yield: 1, mushroom: "gold" }, 2)).toBe(2);
    expect(minelordCredit({ resource: "diamonds", mushroom: "diamonds" }, 1)).toBe(1);
    expect(minelordCredit({ resource: "energy", yield: 1 }, 4)).toBe(4);
    expect(minelordCredit({ resource: "token", token: "magicdust", yield: 1 }, 3)).toBe(3);
  });

  it("настройки нет (клетку не прочли) — как раньше, всё собранное", () => {
    expect(minelordCredit(null, 5)).toBe(5);
    expect(minelordCredit(undefined, 0)).toBe(0);
  });
});
