// Прокачка за лайки поднимает героя только с прочитанного уровня и ниже
// потолка: две вкладки с одной ценой не уводят лега на 61/60 за двойную сумму.
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({
  sql: [] as string[],
  /** Что вернёт атомарный стейтмент: поднятый уровень или null (не прошло). */
  newLevel: null as number | null,
  avail: 0,
}));

vi.mock("../db/pg", () => ({ pg: {} }));
vi.mock("./testers", () => ({ requireFeature: async () => "w_me" }));
vi.mock("./raid-shared", () => ({ sqlStr: (v: string) => `'${v.replace(/'/g, "''")}'` }));
vi.mock("../likesAccount", () => ({ likeAccountId: async () => "acc_me" }));
vi.mock("../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    if (!sql.trimStart().startsWith("WITH cur")) return [];
    return [
      {
        new_level: s.newLevel,
        likes_left: s.newLevel == null ? null : s.avail - 400_000,
        avail_before: s.avail,
      },
    ];
  },
}));

const { levelUpHeroAtomic, HERO_LEVEL_CHANGED } = await import("./heroes-shared");

beforeEach(() => {
  s.sql = [];
  s.newLevel = null;
  s.avail = 0;
});

describe("levelUpHeroAtomic", () => {
  it("подъём условный: уровень всё ещё прочитанный и ниже потолка", async () => {
    s.newLevel = 60;
    s.avail = 900_000;
    const r = await levelUpHeroAtomic("w_me", "hero_1", 400_000, { fromLevel: 59, maxLevel: 60 });
    expect(r).toEqual({ newLevel: 60, likesLeft: 500_000 });
    const sql = s.sql[0];
    expect(sql).toContain("AND level = 59");
    expect(sql).toContain("AND level < 60");
  });

  it("лайков хватало, а героя уже подняли — отказ ключом, не «мало лайков»", async () => {
    s.avail = 900_000;
    await expect(
      levelUpHeroAtomic("w_me", "hero_1", 400_000, { fromLevel: 59, maxLevel: 60 }),
    ).rejects.toThrow(HERO_LEVEL_CHANGED);
  });

  it("лайков не хватает — прежний текст с числами", async () => {
    s.avail = 1000;
    await expect(
      levelUpHeroAtomic("w_me", "hero_1", 400_000, { fromLevel: 59, maxLevel: 60 }),
    ).rejects.toThrow("Нужно 400000 лайков, у тебя 1000.00");
  });

  it("мусор вместо потолка — подъёма нет (закрыто, а не без условия)", async () => {
    s.avail = 900_000;
    await levelUpHeroAtomic("w_me", "hero_1", 400_000, {
      fromLevel: 59,
      maxLevel: Number.NaN,
    }).catch(() => undefined);
    expect(s.sql[0]).toContain("AND level < 0");
  });
});
