// Использовать товар-буст (одно зелье, qty штук): списание и эффекты — одна
// транзакция (potion-drink). Изношенный инструмент из рюкзака не уходит
// (§8.18) — своя причина отказа; «столько нет» — без записи; сбой посреди
// эффектов — не списано и не наложено ничего.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { pdb, resetDrinkDb, strayWrites } from "@/test/potionDrinkFake";

vi.mock("@/server/db/mcpClient", async () => ({
  mcpExec: (await import("@/test/potionDrinkFake")).drinkExec,
}));
vi.mock("@/server/api/beta-raid/potion-drink-sql", async () => ({
  potionDrinkSql: (await import("@/test/potionDrinkFake")).drinkSqlStub,
}));
vi.mock("../../auth", () => ({ requireWallet: () => "w1" }));
vi.mock("./market-backpack", () => ({
  resolveBackpack: async () => ({ heroId: "h1", heroName: "Воин" }),
}));
vi.mock("./item-alias", () => ({ canonRef: async (_k: string, ref: string) => ref }));
vi.mock("@/server/api/beta-raid/owner", () => ({ raidOwner: async () => "acc1" }));
vi.mock("./hero-power", () => ({ invalidateHeroPower: () => {}, loadHeroView: async () => null }));
vi.mock("@/server/api/beta-raid/econ/drink-note", () => ({ noteDrink: async () => {} }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const fn = { inputValidator: () => fn, handler: (h: unknown) => h };
    return fn;
  },
}));

const { applyItemBoost } = await import("./boost-item");
type Res = { repeat: boolean; total: number; rolls: unknown[] };
const use = (qty = 1) =>
  (applyItemBoost as unknown as (a: { data: object }) => Promise<Res>)({
    data: { stackKey: "custom:cst_potion", op: "op_123456", qty },
  });

beforeEach(() => {
  resetDrinkDb({ "custom:cst_potion": 3 });
  pdb.boost.set("cst_potion", [
    { stat: "atk", value: "1", minutes: "30" },
    { stat: "luck", value: "2", minutes: "30" },
    { stat: "immune", value: "1", minutes: "15", ability: "all" },
  ]);
});

describe("буст из рюкзака: одно зелье", () => {
  it("изношенный инструмент — своя причина, ничего не списано и не наложено", async () => {
    pdb.worn = true;
    await expect(use()).rejects.toThrow("braid.tool_worn_stays");
    expect(pdb.stock.get("custom:cst_potion")).toBe(3);
    expect(pdb.fx).toEqual([]);
    expect(pdb.ops.size).toBe(0);
  });

  it("«столько нет» — отказ без записи", async () => {
    await expect(use(4)).rejects.toThrow("Столько штук в сумке нет");
    expect(pdb.stock.get("custom:cst_potion")).toBe(3);
    expect(pdb.ops.size).toBe(0);
  });

  it("сбой на втором из трёх эффектов — не списано и не наложено ничего; повтор — ровно раз", async () => {
    pdb.failAfter = 1;
    await expect(use(2)).rejects.toThrow("сбой базы на эффекте №2");
    expect(pdb.stock.get("custom:cst_potion")).toBe(3);
    expect(pdb.fx).toEqual([]);
    expect(pdb.ops.size).toBe(0);
    expect(strayWrites()).toEqual([]);

    pdb.failAfter = null;
    const r = await use(2);
    expect(r.repeat).toBe(false);
    expect(pdb.stock.get("custom:cst_potion")).toBe(1);
    expect(pdb.fx).toEqual([
      { kind: "buff_atk", value: 2, minutes: 30 },
      { kind: "buff_luck", value: 4, minutes: 30 },
      { kind: "immune_all", value: 1, minutes: 30 },
    ]);
    // Тот же ключ ещё раз — «уже выпито».
    const again = await use(2);
    expect(again.repeat).toBe(true);
    expect(pdb.stock.get("custom:cst_potion")).toBe(1);
    expect(pdb.fx).toHaveLength(3);
  });

  it("последнее зелье: стопка уходит целиком", async () => {
    const r = await use(3);
    expect(r.repeat).toBe(false);
    expect(pdb.stock.has("custom:cst_potion")).toBe(false);
    expect(r.total).toBe(3 + 6 + 1);
  });
});
