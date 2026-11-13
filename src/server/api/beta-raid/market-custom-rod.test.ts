// Галочка «Удочка» у своего товара (04.10, ПРАВИЛА §8.35): пишется при создании
// и правке, старая вкладка без поля её не снимает, удочка не может быть зельем,
// сундуком или лопатой (отказ до базы; базу держит ограничение fish-01), износ
// за поимку — обычное «Износ за удар».
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({ sql: [] as string[] }));

vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    if (sql.includes("SELECT id, name, image"))
      return [{ id: "cst_rod", name: "Удочка", is_rod: true, tool_wear: 10 }];
    if (sql.includes("RETURNING magic_chest")) {
      return [
        { magic_chest: false, tool_wear: 10, is_shovel: false, is_rod: /is_rod=true/.test(sql) },
      ];
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
type Fn = (a: { data?: object }) => Promise<{ isRod?: boolean; toolWear?: number | null }>;
const call = (f: unknown, data?: object) => (f as Fn)({ data });
const base = { name: "Удочка", image: null, description: null, boost: null, isPotion: false };

beforeEach(() => void (s.sql = []));

describe("удочка — галочка своего товара", () => {
  it("создание: галочка пишется в is_rod, износ — как у инструмента", async () => {
    const res = await call(mod.createCustomItem, { ...base, isRod: true, toolWear: 10 });
    expect(res).toMatchObject({ isRod: true, toolWear: 10 });
    expect(s.sql[0]).toContain(
      "boost, is_rod, is_potion, plain_chest, magic_chest, is_shovel, tool_wear, is_binocular, is_ladder)",
    );
    // Описание и буст пусты, дальше is_rod; износ — последним (валидатор подменён: без умолчаний).
    expect(s.sql[0]).toMatch(/NULL, NULL, true,\n/);
    expect(s.sql[0]).toMatch(/, 10,\n\s+false, false\);$/);
  });

  it("правка: задана — пишется; старая вкладка без поля — колонку не трогаем", async () => {
    expect((await call(mod.updateCustomItem, { id: "cst_rod", ...base, isRod: true })).isRod).toBe(
      true,
    );
    expect(s.sql[0]).toContain(", is_rod=true");
    await call(mod.updateCustomItem, { id: "cst_rod", ...base });
    expect(s.sql[1]).not.toContain("is_rod=");
  });

  it("удочка-зелье, удочка-сундук, удочка-лопата — отказ до базы", async () => {
    for (const extra of [
      { isPotion: true },
      { magicChest: true },
      { plainChest: true },
      { isShovel: true },
    ]) {
      await expect(call(mod.createCustomItem, { ...base, isRod: true, ...extra })).rejects.toThrow(
        /Удочка|Лопата/,
      );
    }
    await expect(
      call(mod.updateCustomItem, { id: "cst_rod", ...base, isRod: true, isShovel: true }),
    ).rejects.toThrow(/Удочка|Лопата/);
    expect(s.sql).toEqual([]);
  });

  it("список отдаёт галочку", async () => {
    const list = (await call(mod.listCustomItems)) as unknown as Array<{ isRod: boolean }>;
    expect(list[0].isRod).toBe(true);
  });
});
