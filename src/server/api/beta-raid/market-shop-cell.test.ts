// Сделка только там, где лавка стоит: позиции переставленной лавки на пустой
// клетке не покупаются и не сдаются прямым запросом (владелец 25.10.2026).
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ ok: true as boolean | null, sql: [] as string[] }));
vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: vi.fn(async (sql: string) => {
    db.sql.push(sql);
    if (sql.includes("AS ok")) return db.ok == null ? [] : [{ ok: db.ok }];
    return [];
  }),
}));
vi.mock("../../auth", () => ({ getCurrentWallet: () => null, isAdminWallet: () => false }));
vi.mock("./hero-current", () => ({ selectedHero: async () => null }));

import { assertShopAllowed, shopCellSql } from "./market-shop";

describe("лавка на клетке", () => {
  beforeEach(() => {
    db.ok = true;
    db.sql = [];
  });

  it("постройка или блок с постройкой", () => {
    const sql = shopCellSql("m", 36, 61).replace(/\s+/g, " ");
    expect(sql).toContain("c.map_id = 'm' AND c.q = 36 AND c.r = 61");
    expect(sql).toContain("c.building_id IS NOT NULL");
    expect(sql).toContain("g.group_id = c.group_id AND g.building_id IS NOT NULL");
  });

  it("лавка стоит — пускаем (фильтра нет)", async () => {
    await expect(assertShopAllowed("w", "m", 1, 2)).resolves.toBeUndefined();
  });

  it("клетка пустая или её нет — «товар не найден»", async () => {
    db.ok = false;
    await expect(assertShopAllowed("w", "m", 36, 61)).rejects.toThrow("market.not_found");
    db.ok = null;
    await expect(assertShopAllowed("w", "m", 36, 61)).rejects.toThrow("market.not_found");
  });
});
