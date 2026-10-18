// Набор зелий одной кнопкой: списание всё или ничего, одинаковые склеиваются,
// повтор нажатия ничего не списывает, сбой эффекта — зелья обратно в сумку.
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({
  stock: {} as Record<string, number>,
  taken: [] as string[],
  returned: [] as string[],
  released: [] as string[],
  applied: 0,
  fresh: true,
  failApply: false,
}));

vi.mock("../../db/mcpClient", () => ({ mcpExec: async () => [{ boost: null }] }));
vi.mock("../../auth", () => ({ requireWallet: () => "w1" }));
vi.mock("./market-backpack", () => ({
  resolveBackpack: async () => ({ heroId: "h1", heroName: "Воин" }),
  takeFromBackpackStack: async (_h: string, key: string, qty: number) => {
    if ((s.stock[key] ?? 0) < qty) return null;
    s.stock[key] -= qty;
    s.taken.push(`${key}×${qty}`);
    return { kind: "custom", ref: key };
  },
  returnToBackpackStack: async (_h: string, key: string, qty: number) => {
    s.stock[key] = (s.stock[key] ?? 0) + qty;
    s.returned.push(`${key}×${qty}`);
  },
}));
vi.mock("./item-alias", () => ({ canonRef: async (_k: string, ref: string) => ref }));
vi.mock("./boost-item", () => ({
  itemBoost: async (canon: string) => (canon === "cst_junk" ? [] : [{ stat: "atk", value: "1", minutes: "30" }]),
}));
vi.mock("./hero-boost", () => ({
  claimBoostOp: async () => s.fresh,
  releaseBoostOp: async (op: string) => void s.released.push(op),
  boostOpAmount: async () => 7,
}));
vi.mock("./hero-buff", () => ({
  applyBoostRoll: async () => {
    if (s.failApply) throw new Error("сбой базы");
    s.applied++;
  },
}));
vi.mock("./hero-power", () => ({ invalidateHeroPower: () => {} }));
vi.mock("@/server/api/beta-raid/econ/drink-note", () => ({ noteDrink: async () => {} }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const fn = { inputValidator: () => fn, handler: (h: unknown) => h };
    return fn;
  },
}));

const { applyItemBoosts } = await import("./boost-items");
type Res = { repeat: boolean; items: Array<{ stackKey: string; qty: number }>; total: number };
const use = (items: Array<{ stackKey: string; qty: number }>) =>
  (applyItemBoosts as unknown as (a: { data: object }) => Promise<Res>)({ data: { items, op: "op_batch1" } });

beforeEach(() =>
  Object.assign(s, {
    stock: { "custom:cst_a": 5, "custom:cst_b": 2 },
    taken: [],
    returned: [],
    released: [],
    applied: 0,
    fresh: true,
    failApply: false,
  }),
);

describe("набор зелий одной кнопкой", () => {
  it("разные виды — одним вызовом, одинаковые склеиваются", async () => {
    const r = await use([
      { stackKey: "custom:cst_a", qty: 1 },
      { stackKey: "custom:cst_b", qty: 2 },
      { stackKey: "custom:cst_a", qty: 2 },
    ]);
    expect(r.repeat).toBe(false);
    expect(r.items.map((i) => `${i.stackKey}×${i.qty}`)).toEqual(["custom:cst_a×3", "custom:cst_b×2"]);
    expect(s.taken).toEqual(["custom:cst_a×3", "custom:cst_b×2"]);
    expect(s.applied).toBe(2); // по одному начислению на вид: эффекты одного вида складываются (rollBoostQty)
    expect(s.stock).toEqual({ "custom:cst_a": 2, "custom:cst_b": 0 });
  });

  it("одного вида не хватило — уже списанное вернулось, эффектов нет, ключ отпущен", async () => {
    await expect(use([{ stackKey: "custom:cst_a", qty: 2 }, { stackKey: "custom:cst_b", qty: 3 }])).rejects.toThrow(
      "Столько штук в сумке нет: custom:cst_b",
    );
    expect(s.returned).toEqual(["custom:cst_a×2"]);
    expect(s.stock).toEqual({ "custom:cst_a": 5, "custom:cst_b": 2 });
    expect(s.applied).toBe(0);
    expect(s.released).toEqual(["op_batch1"]);
  });

  it("товар без эффекта — отказ до любого списания", async () => {
    await expect(use([{ stackKey: "custom:cst_a", qty: 1 }, { stackKey: "custom:cst_junk", qty: 1 }])).rejects.toThrow(
      "ничего не даёт",
    );
    expect(s.taken).toEqual([]);
  });

  it("сбой начисления эффекта — все зелья обратно в сумку", async () => {
    s.failApply = true;
    await expect(use([{ stackKey: "custom:cst_a", qty: 1 }, { stackKey: "custom:cst_b", qty: 1 }])).rejects.toThrow("сбой базы");
    expect(s.stock).toEqual({ "custom:cst_a": 5, "custom:cst_b": 2 });
    expect(s.released).toEqual(["op_batch1"]);
  });

  it("повтор того же нажатия ничего не списывает", async () => {
    s.fresh = false;
    const r = await use([{ stackKey: "custom:cst_a", qty: 1 }]);
    expect(r.repeat).toBe(true);
    expect(r.total).toBe(7);
    expect(s.taken).toEqual([]);
  });
});
