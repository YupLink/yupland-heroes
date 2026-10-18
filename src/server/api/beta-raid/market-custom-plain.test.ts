// Галочка «Сундук» у своего товара (29.09, ПРАВИЛА §8.22): пишется при создании
// и правке, старая вкладка без поля её не снимает; «Сундук», «Магический
// сундук», «Зелье», «Лопата» — взаимоисключающие, сундук не изнашивается
// (отказ до базы; базу держат ограничения pchest-01).
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({ sql: [] as string[] }));

vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    if (sql.includes("SELECT id, name, image"))
      return [{ id: "cst_box", name: "Сундук", plain_chest: true }];
    if (sql.includes("RETURNING magic_chest")) {
      return [{ magic_chest: false, tool_wear: null, is_shovel: false, plain_chest: /plain_chest=true/.test(sql) }];
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
type Fn = (a: { data?: object }) => Promise<{ plainChest?: boolean }>;
const call = (f: unknown, data?: object) => (f as Fn)({ data });
const base = { name: "Сундук", image: null, description: null, boost: null, isPotion: false };

beforeEach(() => void (s.sql = []));

describe("сундук — галочка своего товара", () => {
  it("создание: галочка пишется в plain_chest", async () => {
    // Валидатор в тесте не зовётся — умолчания zod задаём сами.
    const data = { ...base, plainChest: true, magicChest: false, isShovel: false, toolWear: null };
    expect((await call(mod.createCustomItem, data)).plainChest).toBe(true);
    expect(s.sql[0]).toContain("is_potion, plain_chest, magic_chest, is_shovel, tool_wear)");
    expect(s.sql[0]).toMatch(/false, true, false, false, NULL\);$/);
  });

  it("правка: задана — пишется; старая вкладка без поля — колонку не трогаем", async () => {
    expect((await call(mod.updateCustomItem, { id: "cst_box", ...base, plainChest: true })).plainChest).toBe(true);
    expect(s.sql[0]).toContain(", plain_chest=true");
    await call(mod.updateCustomItem, { id: "cst_box", ...base });
    expect(s.sql[1]).not.toContain("plain_chest=");
  });

  it("не больше одной галочки из четырёх; сундук с износом — отказ до базы", async () => {
    await expect(call(mod.createCustomItem, { ...base, plainChest: true, magicChest: true })).rejects.toThrow(
      "не вместе",
    );
    await expect(call(mod.createCustomItem, { ...base, plainChest: true, isPotion: true })).rejects.toThrow(
      "не вместе",
    );
    await expect(call(mod.createCustomItem, { ...base, plainChest: true, isShovel: true })).rejects.toThrow(
      "Лопата",
    );
    await expect(call(mod.updateCustomItem, { id: "cst_box", ...base, plainChest: true, toolWear: 10 })).rejects.toThrow(
      "не изнашивается",
    );
    expect(s.sql).toEqual([]);
  });

  it("список отдаёт галочку", async () => {
    const list = (await call(mod.listCustomItems)) as unknown as Array<{ plainChest: boolean }>;
    expect(list[0].plainChest).toBe(true);
  });
});
