// «Износ за удар, %» у своего товара (28.09): сохраняется числом 1…100, пусто —
// «ломается сразу»; старая вкладка без поля износ не стирает; сундук
// изнашиваться не может; правка износа сразу доходит до рубки (кэш декора).
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({ sql: [] as string[], dropped: 0 }));

vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    if (sql.includes("SELECT id, name, image")) {
      return [{ id: "cst_axe", name: "Топор", tool_wear: "25", magic_chest: false }];
    }
    if (sql.includes("RETURNING magic_chest, tool_wear")) {
      const m = /tool_wear=(\d+|NULL)/.exec(sql)?.[1];
      return [{ magic_chest: false, tool_wear: m && m !== "NULL" ? Number(m) : null }];
    }
    return [];
  },
}));
vi.mock("../../auth", () => ({ getCurrentWallet: () => "w1", isAdminWallet: () => true }));
vi.mock("./item-alias", () => ({ invalidateAliases: () => {} }));
vi.mock("./decor-interact", () => ({ dropInteractiveDecorCache: () => void s.dropped++ }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const fn = { inputValidator: () => fn, handler: (h: unknown) => h };
    return fn;
  },
}));

const mod = await import("./market-custom");
type Fn = (a: { data?: object }) => Promise<{ toolWear?: number | null }>;
const call = (f: unknown, data?: object) => (f as Fn)({ data });
const base = { name: "Топор", image: null, description: null, boost: null, isPotion: false };

beforeEach(() => Object.assign(s, { sql: [], dropped: 0 }));

describe("износ своего товара", () => {
  it("создание: число пишется, пусто — NULL", async () => {
    expect((await call(mod.createCustomItem, { ...base, toolWear: 25 })).toolWear).toBe(25);
    expect(s.sql[0]).toMatch(/, 25\);$/);
    expect((await call(mod.createCustomItem, { ...base, toolWear: null })).toolWear).toBeNull();
    expect(s.sql[1]).toMatch(/, NULL\);$/);
  });

  it("правка: задан — пишется и рубка берёт свежее; старая вкладка без поля — не трогаем", async () => {
    const res = await call(mod.updateCustomItem, { id: "cst_axe", ...base, toolWear: 30 });
    expect(res.toolWear).toBe(30);
    expect(s.dropped).toBe(1);
    await call(mod.updateCustomItem, { id: "cst_axe", ...base });
    expect(s.sql[1]).not.toContain("tool_wear=");
    expect(s.dropped).toBe(1);
  });

  it("магический сундук с износом — отказ до базы", async () => {
    const chest = { ...base, magicChest: true, toolWear: 10 };
    await expect(call(mod.createCustomItem, chest)).rejects.toThrow("не изнашивается");
    await expect(call(mod.updateCustomItem, { id: "cst_1", ...chest })).rejects.toThrow(
      "не изнашивается",
    );
    expect(s.sql).toEqual([]);
  });

  it("список отдаёт износ числом, мусор — «ломается сразу»", async () => {
    const list = (await call(mod.listCustomItems)) as unknown as Array<{ toolWear: unknown }>;
    expect(list[0].toolWear).toBe(25);
  });
});
