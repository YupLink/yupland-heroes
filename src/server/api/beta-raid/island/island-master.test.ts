// Выключатель острова-образца (владелец, 04.11.2026: «включишь как скажу»):
// пока on не true — острова строит генератор; товары лавок копируются с новыми id.
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({ value: null as unknown }));
vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async () => (s.value == null ? [] : [{ value: s.value }]),
}));

const { masterMapId, masterShopsSql } = await import("./island-master");

beforeEach(() => (s.value = null));

describe("образец острова", () => {
  it("выключен, нет настройки, не остров — генератор", async () => {
    expect(await masterMapId()).toBeNull();
    s.value = '{"mapId":"isle_jzVNmDJP4t","on":false}';
    expect(await masterMapId()).toBeNull();
    s.value = { mapId: "rmap_live", on: true };
    expect(await masterMapId()).toBeNull();
  });
  it("включён — его карта", async () => {
    s.value = '{"mapId":"isle_jzVNmDJP4t","on":true}';
    expect(await masterMapId()).toBe("isle_jzVNmDJP4t");
  });
  it("лавки и товары — копией на новую карту, id товара от новой карты, продаж нет", () => {
    const [shops, items] = masterShopsSql("isle_m", "isle_new");
    expect(shops).toContain("FROM yuplink.raid_market_shop s WHERE s.map_id = 'isle_m'");
    expect(shops).toContain("'map_id', 'isle_new'");
    expect(items).toContain("THEN 'isle_new' || substr(i.id, length('isle_m') + 1)");
    expect(items).toContain("'sold', 0");
  });
});
