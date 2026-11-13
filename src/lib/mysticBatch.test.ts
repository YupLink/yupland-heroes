// «Открыть все» Bonus Box (до 50) и сводка выпавшего: количественные призы
// одного вида — одной суммой, одинаковые предметы — одной карточкой «×n».
import { describe, expect, it } from "vitest";
import { REF_BOX_PACK_ID } from "@/lib/referralRewards";
import { groupMysticPrizes, isMysticBatchPack, mysticOpenAllCount } from "./mysticBatch";
import type { MysticPrize } from "@/server/api/mystic-grant";

describe("«Открыть все» — только Bonus Box, N ≥ 2, не больше 50", () => {
  it.each([
    [1, 0],
    [2, 2],
    [5, 5],
    [15, 15],
    [50, 50],
    [120, 50],
    [182, 50],
  ])("Bonus Box ×%i → %i", (n, want) => {
    expect(mysticOpenAllCount(REF_BOX_PACK_ID, n)).toBe(want);
  });

  it("другие мистические боксы — кнопки нет", () => {
    expect(isMysticBatchPack("cp_other")).toBe(false);
    expect(mysticOpenAllCount("cp_other", 120)).toBe(0);
  });
});

describe("сводка пачки", () => {
  it("количественные призы складываются по виду и коду в одну строку", () => {
    const prizes: MysticPrize[] = [
      { kind: "energy", amount: 5 },
      { kind: "resource", amount: 100, code: "gold" },
      { kind: "energy", amount: 7 },
      { kind: "resource", amount: 30, code: "wood" },
      { kind: "resource", amount: 250, code: "gold" },
      { kind: "likes", amount: 3 },
      { kind: "likes", amount: 4 },
      { kind: "token", amount: 0.1, code: "Darai" },
      { kind: "token", amount: 0.2, code: "Darai" },
      { kind: "token", amount: 2, code: "STARS" },
      { kind: "custom", amount: 1, code: "potion_hp", name: "Зелье" },
      { kind: "custom", amount: 2, code: "potion_hp", name: "Зелье" },
    ];
    const g = groupMysticPrizes(prizes);
    const row = (kind: string, code?: string) =>
      g.find((x) => x.prize.kind === kind && x.prize.code == code)!;
    expect(g).toHaveLength(7);
    expect(row("energy")).toMatchObject({ prize: { amount: 12 }, times: 2, summed: true });
    expect(row("resource", "gold")).toMatchObject({
      prize: { amount: 350 },
      times: 2,
      summed: true,
    });
    expect(row("resource", "wood").prize.amount).toBe(30);
    expect(row("likes").prize.amount).toBe(7);
    expect(row("token", "Darai").prize.amount).toBe(0.3); // без хвоста 0.30000000000000004
    expect(row("token", "STARS").prize.amount).toBe(2);
    expect(row("custom", "potion_hp").prize.amount).toBe(3);
    // порядок — по первому выпадению
    expect(g[0].prize.kind).toBe("energy");
  });

  it("одинаковые артефакты — одна карточка ×n; другая редкость — отдельно", () => {
    const art = (rarity: string, itemId: string): MysticPrize => ({
      kind: "artifact",
      name: "Кольцо",
      image: "/a.png",
      rarity,
      itemId,
    });
    const g = groupMysticPrizes([
      art("epic", "u1"),
      art("epic", "u2"),
      art("rare", "u3"),
      art("epic", "u4"),
    ]);
    expect(g).toHaveLength(2);
    expect(g[0]).toMatchObject({ times: 3, summed: false, prize: { rarity: "epic" } });
    expect(g[0].prize.itemId).toBeUndefined();
    expect(g[1]).toMatchObject({ times: 1, prize: { rarity: "rare" } });
  });

  it("герои — по имени и уровню; паки — по имени; пустые — одной строкой ×n", () => {
    const g = groupMysticPrizes([
      { kind: "hero", name: "Воин", level: 3 },
      { kind: "hero", name: "Воин", level: 3 },
      { kind: "hero", name: "Воин", level: 4 },
      { kind: "pack", name: "Пак", image: null },
      { kind: "pack", name: "Пак", image: null },
      { kind: "blank" },
      { kind: "blank" },
      { kind: "blank" },
    ]);
    expect(g.map((x) => [x.prize.kind, x.times, x.summed])).toEqual([
      ["hero", 2, false],
      ["hero", 1, false],
      ["pack", 2, false],
      ["blank", 3, false],
    ]);
  });
});
