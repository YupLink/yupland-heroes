// Галочка «Карта» у своего товара (05.10, ПРАВИЛА §8.32): пишется при создании
// и правке, старая вкладка без поля её не снимает; карта не может быть зельем,
// сундуком, лопатой или удочкой (отказ до базы; базу держит ограничение map-01).
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({ sql: [] as string[] }));

vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    if (sql.includes("SELECT id, name, image"))
      return [{ id: "cst_map", name: "Карта", is_map: true, is_rod: false }];
    if (sql.includes("RETURNING magic_chest")) {
      return [{ magic_chest: false, tool_wear: null, is_map: /is_map=true/.test(sql) }];
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
type Fn = (a: { data?: object }) => Promise<{ isMap?: boolean; isRod?: boolean; id?: string }>;
const call = (f: unknown, data?: object) => (f as Fn)({ data });
const base = { name: "Карта", image: null, description: null, boost: null, isPotion: false };

beforeEach(() => void (s.sql = []));

describe("карта — галочка своего товара", () => {
  it("создание: галочка пишется в is_map и возвращается", async () => {
    const res = await call(mod.createCustomItem, { ...base, isMap: true });
    expect(res).toMatchObject({ isMap: true, name: "Карта" });
    expect(res.id).toMatch(/^cst_/);
    expect(s.sql[0]).toContain("(id, name, image, description, is_map, category_id,");
    // Описание пусто, следом is_map.
    expect(s.sql[0]).toMatch(/NULL, true, /);
  });

  it("правка: задана — пишется; старая вкладка без поля — колонку не трогаем", async () => {
    const res = await call(mod.updateCustomItem, { id: "cst_map", ...base, isMap: true });
    expect(res.isMap).toBe(true);
    expect(s.sql[0]).toContain(", is_map=true");
    expect(s.sql[0]).toContain("RETURNING magic_chest, tool_wear, is_shovel, plain_chest");
    await call(mod.updateCustomItem, { id: "cst_map", ...base });
    expect(s.sql[1]).not.toContain("is_map=");
  });

  it("карта-зелье, карта-сундук, карта-лопата, карта-удочка — отказ до базы", async () => {
    for (const extra of [
      { isPotion: true },
      { magicChest: true },
      { plainChest: true },
      { isShovel: true },
      { isRod: true },
    ]) {
      await expect(call(mod.createCustomItem, { ...base, isMap: true, ...extra })).rejects.toThrow(
        /Карта|Удочка|Лопата/,
      );
      await expect(
        call(mod.updateCustomItem, { id: "cst_map", ...base, isMap: true, ...extra }),
      ).rejects.toThrow(/Карта|Удочка|Лопата/);
    }
    expect(s.sql).toEqual([]);
  });

  it("список отдаёт галочку", async () => {
    const list = (await call(mod.listCustomItems)) as unknown as Array<{ isMap: boolean }>;
    expect(list[0].isMap).toBe(true);
    expect(s.sql[0]).toContain("is_rod, is_map");
  });
});
