// Ёмкость рюкзака и сумки зелий с временным баффом Торговли/Алхимии: +10
// Торговли = +1 ячейка рюкзака, +10 Алхимии = +1 ячейка сумки. Бафф
// кончился — ёмкость падает: рюкзак над ёмкостью доливает свои ячейки, а
// сумка над ёмкостью (правило владельца 29.09) не берёт ничего — но и не теряет.
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  rows: [] as Array<{ stackKey: string; count: number; potion?: boolean }>,
}));

vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) =>
    /SELECT id FROM yuplink\.raid_custom_item/.test(sql) ? [] : state.rows,
}));

import { assertBackpackRoom, backpackHeroOf } from "./market-backpack";
import type { LoadedHero } from "./hero-load";

const HERO: LoadedHero = {
  heroId: "hero_1",
  name: "Тест",
  imageUrl: null,
  race: null,
  spec: "Воин",
  level: 1,
  rarity: "rare",
  skills: {},
  equipped: {},
  gear: [],
  squad: [],
};

beforeEach(() => {
  state.rows = [];
});

describe("backpackHeroOf с баффом", () => {
  it("без баффа — база по редкости", () => {
    const bp = backpackHeroOf(HERO);
    expect(bp.trade).toBe(0);
    expect(bp.alchemy).toBe(0);
    expect(bp.capacity).toBe(1);
    expect(bp.potionCapacity).toBe(3);
  });

  it("Торговля и Алхимия из баффа растят обе ёмкости", () => {
    const bp = backpackHeroOf(HERO, { trade: 20, alchemy: 10 });
    expect(bp.trade).toBe(20);
    expect(bp.alchemy).toBe(10);
    expect(bp.capacity).toBe(3);
    expect(bp.potionCapacity).toBe(4);
  });

  it("боевые баффы ёмкость не трогают", () => {
    expect(backpackHeroOf(HERO, { atk: 50, luck: 50 }).capacity).toBe(1);
  });
});

describe("бафф кончился — вещи не теряются", () => {
  it("рюкзак над ёмкостью не запирается на долив в свою ячейку", async () => {
    // С баффом было 3 ячейки и заняли все три; бафф сошёл — ёмкость 1.
    state.rows = [
      { stackKey: "custom:a", count: 20 },
      { stackKey: "custom:b", count: 20 },
      { stackKey: "custom:c", count: 5 },
    ];
    const bp = backpackHeroOf(HERO);
    await expect(assertBackpackRoom(bp, "custom:c", 5)).resolves.toBeUndefined();
    // Новую ячейку сверх — нельзя, но и старые никуда не деваются.
    await expect(assertBackpackRoom(bp, "custom:d", 1)).rejects.toThrow(/backpack_need/);
  });

  it("сумка над ёмкостью после баффа Алхимии: зелья целы, новых не берёт", async () => {
    // С баффом (+10 Алхимии) было 4 ячейки, заняли все; бафф сошёл — ёмкость 3.
    state.rows = [
      { stackKey: "custom:p1", count: 20, potion: true },
      { stackKey: "custom:p2", count: 20, potion: true },
      { stackKey: "custom:p3", count: 20, potion: true },
      { stackKey: "custom:p4", count: 5, potion: true },
    ];
    await expect(
      assertBackpackRoom(backpackHeroOf(HERO, { alchemy: 10 }), "custom:p4", 15),
    ).resolves.toBeUndefined();
    const after = backpackHeroOf(HERO);
    expect(after.potionCapacity).toBe(3);
    await expect(assertBackpackRoom(after, "custom:p4", 1)).rejects.toThrow(
      "market.potion_bag_need:1:0",
    );
    // Рюкзак (одна ячейка у редкого Воина) зелья не занимают.
    await expect(assertBackpackRoom(after, "custom:a", 20)).resolves.toBeUndefined();
  });
});
