// Подписи добычи в тостах встречи: награда билетами видна золотом ×100 (ПРАВИЛА §8.61).
import { describe, expect, it } from "vitest";
import { rewardLabel, rewardsLine } from "./lootLabels";

const t = (key: string) => ({ "braid.loot_tickets": "gold", "braid.loot_likes": "like" })[key] ?? key;

describe("rewardLabel", () => {
  it("билеты — золотом ×100 (по-русски и через словарь)", () => {
    expect(rewardLabel({ kind: "tickets", amount: 3 })).toBe("300 золота");
    expect(rewardLabel({ kind: "tickets", amount: 0.5 }, t)).toBe("50 gold");
  });

  it("прочие виды не трогаем", () => {
    expect(rewardLabel({ kind: "likes", amount: 4 }, t)).toBe("4 like");
    expect(rewardLabel({ kind: "Darai", amount: 1000 })).toBe("1000 Darai");
  });

  it("строка из нескольких наград", () => {
    expect(rewardsLine([{ kind: "tickets", amount: 1 }, { kind: "likes", amount: 2 }])).toBe(
      "100 золота, 2 лайк",
    );
  });
});
