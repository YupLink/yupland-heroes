// Группа наград: один ключ на сервер и клиент, склейка по типам.
import { describe, it, expect } from "vitest";
import { groupPendingRewards, isPieceKind, isTokenKind, rewardGroupKey } from "./rewardGroup";

describe("ключ группы", () => {
  it("пустая ссылка — часть ключа, а не его отсутствие", () => {
    expect(rewardGroupKey("likes", null)).toBe("likes:");
    expect(rewardGroupKey("likes", undefined)).toBe("likes:");
    expect(rewardGroupKey("likes", null)).toBe(rewardGroupKey("likes", null));
  });

  it("разные ссылки одного вида — разные группы", () => {
    expect(rewardGroupKey("custom", "cst_a")).not.toBe(rewardGroupKey("custom", "cst_b"));
    expect(rewardGroupKey("resource", "gold")).toBe("resource:gold");
  });
});

describe("штучные виды", () => {
  it("пак и артефакт — ×N, товар и токены — суммой", () => {
    expect(isPieceKind("pack")).toBe(true);
    expect(isPieceKind("item")).toBe(true);
    expect(isPieceKind("custom")).toBe(false);
    expect(isPieceKind("Darai")).toBe(false);
    expect(isPieceKind("likes")).toBe(false);
  });

  it("токен — всё, что не оседает в игре", () => {
    expect(isTokenKind("Darai")).toBe(true);
    expect(isTokenKind("USDT")).toBe(true);
    expect(isTokenKind("likes")).toBe(false);
    expect(isTokenKind("gold")).toBe(false);
    expect(isTokenKind("custom")).toBe(false);
  });
});

describe("склейка по типам", () => {
  const r = (
    kind: string,
    packId: string | null,
    amount: number,
    count: number,
    name?: string,
  ) => ({
    kind,
    packId,
    amount,
    count,
    ...(name ? { name } : {}),
  });

  it("суммирует количество и число наград одного типа по всем целям", () => {
    const out = groupPendingRewards([
      { rewards: [r("likes", null, 25, 1), r("custom", "cst_a", 0.5, 1, "Хлеб")] },
      { rewards: [r("likes", null, 7.5, 2), r("custom", "cst_a", 1.25, 3, "Хлеб")] },
      { rewards: [r("custom", "cst_b", 2, 1, "Пыльца")] },
    ]);
    expect(out).toEqual([
      r("custom", "cst_a", 1.75, 4, "Хлеб"),
      r("likes", null, 32.5, 3),
      r("custom", "cst_b", 2, 1, "Пыльца"),
    ]);
  });

  it("не трогает исходные объекты целей", () => {
    const src = { rewards: [r("likes", null, 5, 1)] };
    groupPendingRewards([src, { rewards: [r("likes", null, 5, 1)] }]);
    expect(src.rewards[0]).toEqual(r("likes", null, 5, 1));
  });

  it("крупные группы сверху, при равном числе — по сумме", () => {
    const out = groupPendingRewards([
      { rewards: [r("item", "art_1", 1, 1), r("Darai", null, 1000, 1), r("likes", null, 3, 2)] },
    ]);
    expect(out.map((x) => x.kind)).toEqual(["likes", "Darai", "item"]);
  });

  it("пусто — пусто", () => {
    expect(groupPendingRewards([])).toEqual([]);
  });

  it("срок группы — ближайший; бессрочная награда его не отодвигает", () => {
    const ore = (amount: number, expiresAt: number | null) => ({
      ...r("custom", "cst_ore", amount, 1, "Руда"),
      expiresAt,
    });
    const [one] = groupPendingRewards([
      { rewards: [ore(5, null)] },
      { rewards: [ore(40, 900)] },
      { rewards: [ore(2, 500)] },
    ]);
    expect(one).toMatchObject({ amount: 47, count: 3, expiresAt: 500 });
  });
});
