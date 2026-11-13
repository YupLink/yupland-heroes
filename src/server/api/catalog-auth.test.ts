// Справочники без денег (право catalogs, владелец 04.11.2026): админ — как было;
// не админ — присланное без токенов, шаблон с деньгами не трогает, удаляет только
// то, чего нет у игроков.
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({
  admin: false,
  right: true,
  meta: null as unknown,
  owned: false,
}));
vi.mock("@/server/auth", () => ({
  getCurrentWallet: () => "designer.near",
  isAdminWallet: () => s.admin,
}));
vi.mock("@/server/admin-rights", () => ({ walletHasRight: async () => s.right }));
vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    if (sql.includes("FROM yuplink.mystic_item_template")) return [{ meta: s.meta }];
    if (sql.includes("FROM yuplink.raid_boss_template")) return [{ reward_tiers: s.meta }];
    if (sql.includes("FROM yuplink.user_game_item")) return s.owned ? [{ ok: 1 }] : [];
    return [];
  },
}));

const c = await import("./catalog-auth");
const darai = { fillers: [{ kind: "token", token: "Darai", amount: 5 }] };
const gold = { fillers: [{ kind: "resource", resource: "gold", amount: 5 }] };

beforeEach(() => Object.assign(s, { admin: false, right: true, meta: null, owned: false }));

describe("право catalogs", () => {
  it("кто: админ — с деньгами, право — без, никто — отказ", async () => {
    expect(await c.requireCatalogEditor()).toEqual({ wallet: "designer.near", money: false });
    s.admin = true;
    expect(await c.requireCatalogEditor()).toEqual({ wallet: "designer.near", money: true });
    Object.assign(s, { admin: false, right: false });
    await expect(c.requireCatalogEditor()).rejects.toThrow("Нет доступа");
  });

  it("присланное — без токенов; у админа — как есть", () => {
    const soft = { wallet: "w", money: false };
    expect(c.withoutMoney(soft, { rewardConfig: { ...darai, packs: [] } })).toEqual({
      rewardConfig: { fillers: [], packs: [] },
    });
    expect(c.withoutMoney({ wallet: "w", money: true }, darai)).toBe(darai);
    expect(c.hasMoney(darai)).toBe(true);
    expect(c.hasMoney(gold)).toBe(false);
  });

  it("шаблон с деньгами — только админу; без денег — можно", async () => {
    const soft = await c.requireCatalogEditor();
    s.meta = { rewardConfig: darai };
    await expect(c.assertItemTemplateFree(soft, "tpl_1")).rejects.toThrow("только админ");
    await expect(c.assertBossTemplateFree(soft, "rbt_1")).rejects.toThrow("только админ");
    s.meta = { rewardConfig: gold };
    await expect(c.assertItemTemplateFree(soft, "tpl_1")).resolves.toBeUndefined();
    await expect(c.assertBossTemplateFree(soft, "rbt_1")).resolves.toBeUndefined();
  });

  it("удалить — только то, чего нет у игроков", async () => {
    const soft = await c.requireCatalogEditor();
    s.owned = true;
    await expect(c.assertItemTemplateDeletable(soft, "tpl_1")).rejects.toThrow("есть у игроков");
    s.owned = false;
    await expect(c.assertItemTemplateDeletable(soft, "tpl_1")).resolves.toBeUndefined();
  });
});
