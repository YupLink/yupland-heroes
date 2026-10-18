// Бонус к рыбалке — проценты от базы, складываются (владелец, 14.10.2026).
import { describe, expect, it } from "vitest";
import { fishBonusText, fishChanceWith, heroFishBonus, luckFishBonus } from "@/lib/raid/fishBonus";
import { fishHit } from "@/lib/raid/fishing";

describe("бонус к рыбалке", () => {
  it("удача: каждые полные 50 — +10 % к базе, до 50 ничего", () => {
    expect(luckFishBonus(0)).toBe(0);
    expect(luckFishBonus(49)).toBe(0);
    expect(luckFishBonus(50)).toBe(10);
    expect(luckFishBonus(120)).toBe(20);
  });

  it("примеры владельца: +10 % → 11 %, +50 % → 15 %, +50 и удача 50 → 16 %", () => {
    expect(fishChanceWith(10, 10)).toBe(11);
    expect(fishChanceWith(10, 50)).toBe(15);
    expect(fishChanceWith(10, heroFishBonus({ gear: [{ fishBonusPct: 50 }], luck: 50 }))).toBe(16);
  });

  it("несколько артефактов складываются, пустые и минусы не считаются", () => {
    const gear = [
      { fishBonusPct: 20 },
      { fishBonusPct: 5 },
      { fishBonusPct: null },
      { fishBonusPct: -30 },
    ];
    expect(heroFishBonus({ gear, luck: 0 })).toBe(25);
  });

  it("шанс не выше 100 %", () => {
    expect(fishChanceWith(10, 5000)).toBe(100);
  });

  it("подпись: ноль — пусто, дробь — с запятой", () => {
    expect(fishBonusText(0)).toBe("");
    expect(fishBonusText(60)).toBe("+60 %");
    expect(fishBonusText(12.5)).toBe("+12,5 %");
    expect(fishBonusText(12.5, "en")).toBe("+12.5 %");
  });
});

describe("бросок с дробным шансом", () => {
  it("целый шанс даёт тот же исход, что до бонусов: hash % 100 < шанс", () => {
    // 10 % и 10,0 % — один и тот же бросок; забросы до выката не переигрываются.
    for (let n = 1; n <= 200; n++) expect(fishHit("s", n, 10)).toBe(fishHit("s", n, 10.0));
  });

  it("дробный шанс сходится к своей доле на 50 000 попыток", () => {
    const n = 50_000;
    let hits = 0;
    for (let i = 1; i <= n; i++) if (fishHit("seed-x", i, 15.5)) hits++;
    expect(hits / n).toBeGreaterThan(0.145);
    expect(hits / n).toBeLessThan(0.165);
  });

  it("больше шанс — не меньше поимок на том же зерне", () => {
    let a = 0;
    let b = 0;
    for (let i = 1; i <= 2000; i++) {
      if (fishHit("z", i, 10)) a++;
      if (fishHit("z", i, 16)) b++;
    }
    expect(b).toBeGreaterThanOrEqual(a);
  });
});
