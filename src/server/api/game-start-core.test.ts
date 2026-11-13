// Меню входа: новичок — без отметки «игру начал» и без героев; герой — только
// из списка на выбор и через стартовую выдачу (раз на аккаунт).
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({
  sql: [] as string[],
  fresh: true,
  grants: [] as Array<[string, string, string]>,
  granted: true,
  greeted: [] as Array<[string, string]>,
  island: true,
  switchOn: true,
  chips: [] as Array<[string, number | null, string | null]>,
}));

const OPTIONS = [
  { id: "hero_bee", name: "Fedr", race: "Пчела", image: "/b.webp" },
  { id: "hero_boar", name: "Skufi", race: "Кабан", image: null },
];

vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    return [{ fresh: s.fresh }];
  },
}));
vi.mock("@/server/api/beta-raid/island/island-gift", () => ({
  islandHeroOptions: async () => OPTIONS,
}));
vi.mock("@/server/api/beta-raid/island/island-newbie", () => ({
  greetNewbie: async (acc: string, wallet: string) => {
    s.greeted.push([acc, wallet]);
    return s.island;
  },
  islandNewbiesOn: async () => s.switchOn,
}));
vi.mock("@/server/api/hallway-skip", () => ({
  grantSkipChips: async (wallet: string, tg: number | null, acc: string | null) => {
    s.chips.push([wallet, tg, acc]);
    return 10;
  },
}));
vi.mock("@/server/api/starter-kit", () => ({
  grantStarterHero: async (acc: string, wallet: string, tpl: string) => {
    s.grants.push([acc, wallet, tpl]);
    return s.granted;
  },
}));

const { gameStartFresh, gameStartStatus, startGameWithHero } = await import("./game-start-core");

beforeEach(() => {
  s.sql = [];
  s.fresh = true;
  s.grants = [];
  s.granted = true;
  s.greeted = [];
  s.island = true;
  s.switchOn = true;
  s.chips = [];
});

describe("gameStartFresh", () => {
  it("новичок = нет отметки, нет героя ни предметом, ни экземпляром", async () => {
    expect(await gameStartFresh("acc_1")).toBe(true);
    const sql = s.sql[0];
    expect(sql).toContain("FROM yuplink.game_start s WHERE s.account_id = 'acc_1'");
    expect(sql).toContain("g.account_id = 'acc_1' AND g.kind = 'hero'");
    expect(sql).toContain("FROM yuplink.hero_instance h WHERE h.account_id = 'acc_1'");
  });

  it("уже играет — false", async () => {
    s.fresh = false;
    expect(await gameStartFresh("acc_1")).toBe(false);
  });
});

describe("gameStartStatus", () => {
  it("новичку — шесть рас на выбор (список острова)", async () => {
    expect(await gameStartStatus("acc_1")).toEqual({ fresh: true, options: OPTIONS });
  });

  it("тому, кто играет, — «Продолжить» без списка", async () => {
    s.fresh = false;
    expect(await gameStartStatus("acc_1")).toEqual({ fresh: false, options: [] });
  });
});

describe("startGameWithHero", () => {
  it("герой из списка — стартовой выдачей на аккаунт и кошелёк", async () => {
    expect(await startGameWithHero("acc_1", "tg42", "hero_boar")).toEqual({
      granted: true,
      island: true,
    });
    expect(s.grants).toEqual([["acc_1", "tg42", "hero_boar"]]);
    // Новичка с героем встречает остров (06.11.2026).
    expect(s.greeted).toEqual([["acc_1", "tg42"]]);
  });

  it("остров не встретил при включённом острове — игра начата, 10 стартовых фишек", async () => {
    s.island = false;
    expect(await startGameWithHero("acc_1", "tg42", "hero_boar", 42)).toEqual({
      granted: true,
      island: false,
    });
    expect(s.chips).toEqual([["tg42", 42, "acc_1"]]);
  });

  it("остров выключен — фишки уже выданы при регистрации, второй раз не зовём", async () => {
    s.island = false;
    s.switchOn = false;
    await startGameWithHero("acc_1", "tg42", "hero_boar", 42);
    expect(s.chips).toEqual([]);
  });

  it("остров встретил — фишек нет (паки из сундука)", async () => {
    await startGameWithHero("acc_1", "tg42", "hero_boar", 42);
    expect(s.chips).toEqual([]);
  });

  it("героя нет в списке — отказ, ничего не выдано", async () => {
    await expect(startGameWithHero("acc_1", "tg42", "hero_legend")).rejects.toThrow(
      "island.hero_unknown",
    );
    expect(s.grants).toHaveLength(0);
  });

  it("повтор после выдачи — не ошибка, просто granted false", async () => {
    s.granted = false;
    expect(await startGameWithHero("acc_1", "tg42", "hero_bee")).toEqual({
      granted: false,
      island: false,
    });
    // Уже начинал — на остров не тянем.
    expect(s.greeted).toEqual([]);
  });
});
