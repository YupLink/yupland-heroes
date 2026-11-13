// Право «справочники» (не админ): свой товар только создаёт; менять и удалять —
// только админ (владелец 04.11.2026: «может только выставлять — менять нельзя»).
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({ sql: [] as string[] }));

vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    return [];
  },
}));
vi.mock("@/server/api/catalog-auth", () => ({
  requireCatalogEditor: async () => ({ wallet: "angelina.tg", money: false }),
}));
vi.mock("./item-alias", () => ({ invalidateAliases: () => {} }));
vi.mock("./decor-interact", () => ({ dropInteractiveDecorCache: () => {} }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const fn = { inputValidator: () => fn, handler: (h: unknown) => h };
    return fn;
  },
}));

const mod = await import("./market-custom");
const call = (f: unknown, data?: object) =>
  (f as (a: { data?: object }) => Promise<unknown>)({ data });
const base = { name: "Яблоко", image: null, description: null, boost: null, isPotion: false };

beforeEach(() => void (s.sql = []));

describe("право «справочники»: только создавать", () => {
  it("создать можно", async () => {
    await expect(call(mod.createCustomItem, base)).resolves.toMatchObject({ name: "Яблоко" });
    expect(s.sql[0]).toContain("INSERT INTO yuplink.raid_custom_item");
  });

  it("поменять и удалить — отказ до базы", async () => {
    await expect(call(mod.updateCustomItem, { ...base, id: "cst_1" })).rejects.toThrow(
      "Менять свой товар — только админ",
    );
    await expect(call(mod.deleteCustomItem, { id: "cst_1" })).rejects.toThrow("только админ");
    expect(s.sql).toEqual([]);
  });
});
