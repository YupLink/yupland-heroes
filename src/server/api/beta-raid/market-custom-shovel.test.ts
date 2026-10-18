// Галочка «Лопата» у своего товара (29.09, ПРАВИЛА §8.21): пишется при создании
// и правке, старая вкладка без поля её не снимает, лопата не может быть зельем
// или магическим сундуком (отказ до базы; базу держит ограничение bag-01).
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({ sql: [] as string[] }));

vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    if (sql.includes("SELECT id, name, image"))
      return [{ id: "cst_sh", name: "Лопата", is_shovel: true }];
    if (sql.includes("RETURNING magic_chest")) {
      return [{ magic_chest: false, tool_wear: null, is_shovel: /is_shovel=true/.test(sql) }];
    }
    return [];
  },
}));
vi.mock("../../auth", () => ({ getCurrentWallet: () => "w1", isAdminWallet: () => true }));
vi.mock("./item-alias", () => ({ invalidateAliases: () => {} }));
vi.mock("./decor-interact", () => ({ dropInteractiveDecorCache: () => {} }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const fn = { inputValidator: () => fn, handler: (h: unknown) => h };
    return fn;
  },
}));

const mod = await import("./market-custom");
type Fn = (a: { data?: object }) => Promise<{ isShovel?: boolean }>;
const call = (f: unknown, data?: object) => (f as Fn)({ data });
const base = { name: "Лопата", image: null, description: null, boost: null, isPotion: false };

beforeEach(() => void (s.sql = []));

describe("лопата — галочка своего товара", () => {
  it("создание: галочка пишется в is_shovel", async () => {
    expect(
      (await call(mod.createCustomItem, { ...base, isShovel: true, toolWear: 25 })).isShovel,
    ).toBe(true);
    expect(s.sql[0]).toContain("magic_chest, is_shovel, tool_wear)");
    expect(s.sql[0]).toMatch(/, true, 25\);$/);
  });

  it("правка: задана — пишется; старая вкладка без поля — колонку не трогаем", async () => {
    expect(
      (await call(mod.updateCustomItem, { id: "cst_sh", ...base, isShovel: true })).isShovel,
    ).toBe(true);
    expect(s.sql[0]).toContain(", is_shovel=true");
    await call(mod.updateCustomItem, { id: "cst_sh", ...base });
    expect(s.sql[1]).not.toContain("is_shovel=");
  });

  it("лопата-зелье и лопата-сундук — отказ до базы", async () => {
    await expect(
      call(mod.createCustomItem, { ...base, isShovel: true, isPotion: true }),
    ).rejects.toThrow("Лопата");
    await expect(
      call(mod.updateCustomItem, { id: "cst_sh", ...base, isShovel: true, magicChest: true }),
    ).rejects.toThrow("Лопата");
    expect(s.sql).toEqual([]);
  });

  it("список отдаёт галочку", async () => {
    const list = (await call(mod.listCustomItems)) as unknown as Array<{ isShovel: boolean }>;
    expect(list[0].isShovel).toBe(true);
  });
});
