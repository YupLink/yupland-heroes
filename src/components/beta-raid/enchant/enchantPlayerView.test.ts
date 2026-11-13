// Вид игрока (владелец, 28.10.2026): легендарные сверху, обычные снизу; превью
// статов при успехе той же applyEnchant — ровное, диапазон, минус.
import { describe, expect, it } from "vitest";
import type { EnchantRarity } from "@/lib/enchant/enchant";
import { spellsByRarity, statPreview } from "@/components/beta-raid/enchant/enchantPlayerView";

describe("spellsByRarity", () => {
  it("legendary → epic → rare → common, внутри редкости — как пришли", () => {
    const list: { id: string; rarity: EnchantRarity }[] = [
      { id: "c1", rarity: "common" },
      { id: "l1", rarity: "legendary" },
      { id: "r1", rarity: "rare" },
      { id: "e1", rarity: "epic" },
      { id: "l2", rarity: "legendary" },
      { id: "c2", rarity: "common" },
      { id: "r2", rarity: "rare" },
    ];
    expect(spellsByRarity(list).map((s) => s.id)).toEqual([
      "l1",
      "l2",
      "e1",
      "r1",
      "r2",
      "c1",
      "c2",
    ]);
  });

  it("исходный список не трогает", () => {
    const list: { id: string; rarity: EnchantRarity }[] = [
      { id: "c", rarity: "common" },
      { id: "l", rarity: "legendary" },
    ];
    spellsByRarity(list);
    expect(list.map((s) => s.id)).toEqual(["c", "l"]);
  });
});

describe("statPreview", () => {
  it("ровное +50%: одно число, зелёным", () => {
    expect(statPreview({ Attack: 10 }, 50, 50)).toEqual([
      { key: "Attack", before: 10, after: [{ n: 15, tone: "up" }] },
    ]);
  });

  it("×2: каждый стат удваивается", () => {
    expect(statPreview({ Attack: 7, Defense: 3 }, 100, 100)).toEqual([
      { key: "Attack", before: 7, after: [{ n: 14, tone: "up" }] },
      { key: "Defense", before: 3, after: [{ n: 6, tone: "up" }] },
    ]);
  });

  it("диапазон −20…+50: «10 → 8…15», низ красным, верх зелёным", () => {
    expect(statPreview({ Attack: 10 }, -20, 50)).toEqual([
      {
        key: "Attack",
        before: 10,
        after: [
          { n: 8, tone: "down" },
          { n: 15, tone: "up" },
        ],
      },
    ]);
  });

  it("минус −10%: одно число красным, вверх как на сервере (7 × 0,9 → 7)", () => {
    expect(statPreview({ Attack: 10, Speed: 7 }, -10, -10)).toEqual([
      { key: "Attack", before: 10, after: [{ n: 9, tone: "down" }] },
      { key: "Speed", before: 7, after: [{ n: 7, tone: "down" }] },
    ]);
  });

  it("схлопнутый диапазон — одно число; знаки разные — без цвета", () => {
    expect(statPreview({ Luck: 0 }, -20, 50)[0].after).toEqual([{ n: 0, tone: null }]);
    expect(statPreview({ Luck: 0 }, 50, 90)[0].after).toEqual([{ n: 0, tone: "up" }]);
  });

  it("нечисловое пропускает", () => {
    expect(statPreview({ Attack: Number.NaN, Defense: 4 }, 50, 50).map((r) => r.key)).toEqual([
      "Defense",
    ]);
  });
});
