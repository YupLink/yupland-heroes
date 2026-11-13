// Улучшение фишки за золото (20.10.2026): цена — стандарт × множитель курса;
// «цена выросла» и «не хватает» — до любых движений; золото списывается ДО
// крафта, сорвался крафт — возврат тем же ключом; билеты в крафт не идут (0).
import { beforeEach, describe, expect, it, vi } from "vitest";

const st = vi.hoisted(() => ({
  ev: [] as string[],
  gold: 1000,
  mult: 1,
  level: 2,
  craftErr: null as string | null,
  payErr: null as string | null,
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const fn = { inputValidator: () => fn, handler: (h: unknown) => h };
    return fn;
  },
}));
vi.mock("../db/pg", () => ({
  pg: {
    userChipInventory: {
      findOne: async () => ({ id: "base", account_id: "acc1", level: st.level, status: "owned" }),
      raw: () => ({
        select: (cols: string) => ({
          in: async () => ({
            data: cols.includes("status")
              ? [{ id: "s1", status: "owned" }]
              : [{ rest_until: null }],
          }),
        }),
      }),
    },
  },
  sb: {
    rpc: async (fn: string, a: Record<string, unknown>) => {
      if (fn === "res_move") {
        st.ev.push(`${a.p_kind}:${a.p_resource}:${a.p_delta}:${a.p_ref}`);
        if (Number(a.p_delta) < 0 && st.payErr) return { error: { message: st.payErr } };
        return { error: null };
      }
      st.ev.push(`${fn}:tickets=${a.p_cost_tickets}`);
      if (st.craftErr) return { data: null, error: { message: st.craftErr } };
      return {
        data: [{ new_chip_id: "n1", new_level: 2.5, new_template_id: "t", new_collection_id: "c" }],
        error: null,
      };
    },
  },
}));
vi.mock("../db/mcpClient", () => ({ mcpExec: async () => [{ amount: st.gold }] }));
vi.mock("./craft-gold-price", () => ({ craftGoldMult: async () => st.mult }));
vi.mock("./chips-mint-helpers", () => ({
  requireWallet: () => "w1",
  levelKey: (l: number) => (Number.isInteger(l) ? String(l) : l.toFixed(1)),
}));
vi.mock("../buildGate", () => ({ requireFreshClient: () => {} }));
vi.mock("../chipRest", () => ({ isChipResting: () => false }));
vi.mock("./chips-mint-helpers-mining", () => ({
  getMiningState: async () => ({ slots: { "0": { chipId: "base" } } }),
  settleMiningSlots: async () => void st.ev.push("mining:settle"),
  saveMiningState: async () => {},
}));
vi.mock("./user-shared", () => ({ accountOf: async () => "acc1" }));
vi.mock("./user", () => ({
  getSisterWallets: async () => ["w1"],
  invalidateTicketsCache: () => {},
}));
vi.mock("./chips-craft-darai", () => ({
  computeDaraiBalance: vi.fn(),
  getMyDaraiBalance: vi.fn(),
  getDaraiDepositInfo: vi.fn(),
  myDaraiDeposits: vi.fn(),
  verifyDaraiDeposit: vi.fn(),
}));
vi.mock("./chips-craft-upgrade", () => ({
  lvlEq: vi.fn(),
  acquireChip: vi.fn(),
  countShortfall: vi.fn(),
  previewAutoUpgradeChip: vi.fn(),
  autoUpgradeChip: vi.fn(),
}));

const { craftChip } = await import("./chips-craft");
type Res = { costGold: number; newChipId: string };
const craft = (expectGold: number) =>
  (craftChip as unknown as (a: { data: unknown }) => Promise<Res>)({
    data: { baseChipId: "base", sacrificeChipIds: ["s1"], expectGold },
  });

beforeEach(() => {
  Object.assign(st, { ev: [], gold: 1000, mult: 1, level: 2, craftErr: null, payErr: null });
});

describe("craftChip за золото", () => {
  it("стандарт 2★ → 2,5★ = 84 золота: списание до крафта, билеты = 0", async () => {
    const r = await craft(84);
    expect(r.costGold).toBe(84);
    expect(st.ev[0]).toBe("mining:settle");
    expect(st.ev[1]).toMatch(/^craft:gold:-84:craft-op:/);
    expect(st.ev[2]).toBe("craft_chip_atomic:tickets=0");
    expect(st.ev).toHaveLength(3);
  });

  it("по курсу: множитель 0,5 — вдвое дешевле показанного стандарта", async () => {
    st.mult = 0.5;
    const r = await craft(84);
    expect(r.costGold).toBe(42);
    expect(st.ev[1]).toMatch(/^craft:gold:-42:/);
  });

  it("цена выше показанной — отказ ДО любых движений", async () => {
    st.mult = 2;
    await expect(craft(84)).rejects.toThrow("Цена изменилась — обнови окно");
    expect(st.ev).toEqual([]);
  });

  it("золота меньше цены — отказ до движений, с ценой и балансом", async () => {
    st.gold = 50;
    await expect(craft(84)).rejects.toThrow("Не хватает золота: нужно 84, у тебя 50");
    expect(st.ev).toEqual([]);
  });

  it("база ушла в минус между проверкой и списанием — «не хватает», крафта нет", async () => {
    st.payErr = "res_move: в минус";
    await expect(craft(84)).rejects.toThrow("Не хватает золота: нужно 84");
    expect(st.ev.some((e) => e.startsWith("craft_chip_atomic"))).toBe(false);
  });

  it("крафт сорвался — возврат тем же ключом видом craft_undo", async () => {
    st.craftErr = "base_not_owned";
    await expect(craft(84)).rejects.toThrow("Базовая фишка не твоя или уже использована");
    const pay = st.ev.find((e) => e.startsWith("craft:"));
    const back = st.ev.find((e) => e.startsWith("craft_undo:"));
    expect(back).toBeDefined();
    expect(back!.split(":").slice(3).join(":")).toBe(pay!.split(":").slice(3).join(":"));
    expect(back).toMatch(/^craft_undo:gold:84:/);
  });
});
