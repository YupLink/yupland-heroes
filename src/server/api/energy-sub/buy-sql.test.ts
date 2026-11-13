// SQL покупки подписки: раскладка денег по корзинам, снимок лицензии тарифа,
// стабильный id подписки от ключа оплаты. База не нужна — проверяется текст запроса.
import { describe, expect, it, vi } from "vitest";

vi.mock("../../db/mcpClient", () => ({ mcpExec: vi.fn(async () => null) }));
vi.mock("../raid-shared", () => ({ sqlStr: (v: string) => `'${String(v).replace(/'/g, "''")}'` }));
vi.mock("../currency/move", () => ({ accAccountId: async () => null }));

const { createSubSql, subIdOf } = await import("./buy-sql");

describe("SQL подписки", () => {
  const tier = {
    id: "esub_novice",
    name: "Нов'ичок",
    nameEn: "N",
    priceUsd: 7,
    energyPerDay: 500,
    boxPackId: null,
    boxesPerDay: 0,
    days: 30,
    active: true,
    sort: 1,
    boxName: null,
    boxImage: null,
    noDecay: false,
    licenseTier: null,
    withdrawBonus: 0,
  };
  const base = { subId: subIdOf("r1"), account: "acc_A", wallet: "w1", tier, rate: 2_601_118, payRef: "r1" };

  it("DARAI: 60 % в пул карты, 15/25 % в корзины, всё — только если подписка создана", () => {
    const sql = createSubSql({ ...base, token: "Darai", amount: 1000 }).replace(/\s+/g, " ");
    expect(sql).toContain("'sub_burn', 'Darai', 150.00000000");
    expect(sql).toContain("'sub_dev', 'Darai', 250.00000000");
    expect(sql).toContain("'map', 'player_spend', 600.00000000");
    expect(sql).toMatch(/FROM sub, \(VALUES/);
    expect(sql).toContain("ON CONFLICT (pay_ref) DO NOTHING");
    expect(sql).toContain("ref = 'r1-undo'");
    expect(sql).toContain("'Нов''ичок'");
  });

  it("USDT: без пула карты, всё в корзину $", () => {
    const sql = createSubSql({ ...base, token: "USDT", amount: 7, rate: null });
    expect(sql).not.toContain("darai_pool_move");
    expect(sql).toContain("'sub_usd', 'USDT'");
  });

  it("лицензия банка тарифа уезжает снимком в подписку (esub-06)", () => {
    const withLic = createSubSql({ ...base, tier: { ...tier, licenseTier: "medium" as const }, token: "Darai", amount: 1 });
    expect(withLic).toMatch(/no_decay, license_tier\)/);
    expect(withLic).toMatch(/false, 'medium'/);
    expect(createSubSql({ ...base, token: "Darai", amount: 1 })).toMatch(/false, NULL/);
  });

  it("id подписки стабилен для одного ключа оплаты", () => {
    expect(subIdOf("r1")).toBe(subIdOf("r1"));
    expect(subIdOf("r1")).not.toBe(subIdOf("r2"));
  });
});
