// Набор зелий одной кнопкой: ключ нажатия, списание и все эффекты — одна
// транзакция (potion-drink). Риск из замечания дизайнера 20.10: сбой после
// части эффектов возвращал зелья, а уже наложенное оставалось даром. Здесь —
// сбой после k из n эффектов, потерянный ответ, повтор нажатия и успех.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { pdb, resetDrinkDb, strayWrites } from "@/test/potionDrinkFake";

const s = vi.hoisted(() => ({ notes: [] as string[] }));

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
vi.mock("./hero-power", () => ({
  invalidateHeroPower: () => {},
  loadHeroView: async () => ({ info: { heroId: "h1", rarity: "rare", spec: null } }),
}));
vi.mock("@/server/api/beta-raid/econ/drink-note", () => ({
  noteDrink: async (o: { op: string }) => void s.notes.push(o.op),
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const fn = { inputValidator: () => fn, handler: (h: unknown) => h };
    return fn;
  },
}));

const { applyItemBoosts } = await import("./boost-items");
type Res = { repeat: boolean; items: Array<{ stackKey: string; qty: number }>; total: number };
type Item = { stackKey: string; qty: number };
const use = (items: Item[], op = "op_batch1") =>
  (applyItemBoosts as unknown as (a: { data: object }) => Promise<Res>)({ data: { items, op } });

const START = { "custom:cst_a": 5, "custom:cst_b": 2 };
const SET: Item[] = [
  { stackKey: "custom:cst_a", qty: 1 },
  { stackKey: "custom:cst_b", qty: 2 },
  { stackKey: "custom:cst_a", qty: 2 },
];
/** Эффектов в наборе SET: a — атака и иммунитет, b — скорость, забвение и сытость. */
const N_FX = 5;

beforeEach(() => {
  resetDrinkDb(START);
  pdb.boost.set("cst_a", [
    { stat: "atk", value: "1", minutes: "30" },
    { stat: "immune", value: "1", minutes: "30", ability: "all" },
  ]);
  pdb.boost.set("cst_b", [
    { stat: "spd", value: "2", minutes: "10" },
    { stat: "oblivion", value: "1", minutes: "" },
    { stat: "satiety", value: "5" },
  ]);
  s.notes = [];
});

const untouched = () => {
  expect(Object.fromEntries(pdb.stock)).toEqual(START);
  expect(pdb.fx).toEqual([]);
  expect(pdb.ops.size).toBe(0);
};

describe("набор зелий одной кнопкой", () => {
  it("разные виды — одним оператором, одинаковые склеиваются, эффекты — ровно раз", async () => {
    const r = await use(SET);
    expect(r.repeat).toBe(false);
    expect(r.items.map((i) => `${i.stackKey}×${i.qty}`)).toEqual([
      "custom:cst_a×3",
      "custom:cst_b×2",
    ]);
    expect(Object.fromEntries(pdb.stock)).toEqual({ "custom:cst_a": 2 });
    expect(pdb.fx).toEqual([
      { kind: "buff_atk", value: 3, minutes: 30 },
      { kind: "buff_spd", value: 4, minutes: 10 },
      { kind: "immune_all", value: 1, minutes: 90 },
      { kind: "oblivion_lv", value: 2, minutes: 0 },
      { kind: "satiety", value: 10, minutes: 0 },
    ]);
    expect(pdb.fx).toHaveLength(N_FX);
    expect(pdb.runs).toBe(1);
    expect(strayWrites()).toEqual([]);
    expect(s.notes).toEqual(["op_batch1:0", "op_batch1:1"]);
  });

  for (let k = 0; k < N_FX; k++) {
    it(`сбой после ${k} из ${N_FX} эффектов — не списано и не наложено ничего; повтор выпивает ровно раз`, async () => {
      pdb.failAfter = k;
      await expect(use(SET)).rejects.toThrow(`сбой базы на эффекте №${k + 1}`);
      untouched();
      // Ни возврата в сумку, ни снятия эффектов вручную: откатывать нечего.
      expect(strayWrites()).toEqual([]);
      expect(s.notes).toEqual([]);

      pdb.failAfter = null;
      const r = await use(SET);
      expect(r.repeat).toBe(false);
      expect(Object.fromEntries(pdb.stock)).toEqual({ "custom:cst_a": 2 });
      expect(pdb.fx).toHaveLength(N_FX);
    });
  }

  it("ответ потерян, мост повторил тот же текст — успех без второго списания", async () => {
    pdb.lose = "retry";
    const r = await use(SET);
    expect(r.repeat).toBe(false);
    expect(pdb.runs).toBe(2);
    expect(Object.fromEntries(pdb.stock)).toEqual({ "custom:cst_a": 2 });
    expect(pdb.fx).toHaveLength(N_FX);
    expect(s.notes).toEqual(["op_batch1:0", "op_batch1:1"]);
  });

  it("ответ потерян, мост сдался — повтор нажатия тем же ключом ничего не добавляет", async () => {
    pdb.lose = "give-up";
    await expect(use(SET)).rejects.toThrow("MCP timeout");
    expect(Object.fromEntries(pdb.stock)).toEqual({ "custom:cst_a": 2 });
    expect(pdb.fx).toHaveLength(N_FX);

    pdb.lose = null;
    const r = await use(SET);
    expect(r.repeat).toBe(true);
    expect(r.total).toBe(pdb.ops.get("op_batch1")?.amount);
    expect(Object.fromEntries(pdb.stock)).toEqual({ "custom:cst_a": 2 });
    expect(pdb.fx).toHaveLength(N_FX);
  });

  it("повтор того же нажатия после успеха — ничего не списывает", async () => {
    const first = await use(SET);
    const again = await use(SET);
    expect(again.repeat).toBe(true);
    expect(again.total).toBe(first.total);
    expect(Object.fromEntries(pdb.stock)).toEqual({ "custom:cst_a": 2 });
    expect(pdb.fx).toHaveLength(N_FX);
  });

  it("одного вида не хватило — не списано ничего, ключ не занят", async () => {
    await expect(
      use([
        { stackKey: "custom:cst_a", qty: 2 },
        { stackKey: "custom:cst_b", qty: 3 },
      ]),
    ).rejects.toThrow("Столько штук в сумке нет: custom:cst_b");
    untouched();
  });

  it("товар без эффекта — отказ до любой записи", async () => {
    await expect(
      use([
        { stackKey: "custom:cst_a", qty: 1 },
        { stackKey: "custom:cst_junk", qty: 1 },
      ]),
    ).rejects.toThrow("ничего не даёт");
    expect(pdb.runs).toBe(0);
    untouched();
  });
});
