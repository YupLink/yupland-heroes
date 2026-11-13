// Авто-улучшение за золото: цена плана — сумма шагов по одному множителю;
// превью отдаёт totalGold/haveGold/goldShortfall; выполнение — защита цены,
// списание до крафта, cost = 0 в шагах для базы, возврат при сбое.
import { beforeEach, describe, expect, it, vi } from "vitest";

const st = vi.hoisted(() => ({
  ev: [] as string[],
  steps: [] as Array<Record<string, unknown>>,
  gold: 1000,
  mult: 1,
  craftErr: null as string | null,
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const fn = { inputValidator: () => fn, handler: (h: unknown) => h };
    return fn;
  },
}));
// База 1,5★ «a»; в коллекции ещё 1,5★ «a» и две 1★ «a»: вторая жертва
// собирается из 1★ (шаг 1 → 1,5), затем 1,5 → 2.
const rows = [
  { id: "uci_s15", level: 1.5, template_id: "a", serial_no: 2, rest_until: null, obtained_at: "1" },
  { id: "uci_s1a", level: 1, template_id: "a", serial_no: 3, rest_until: null, obtained_at: "2" },
  { id: "uci_s1b", level: 1, template_id: "a", serial_no: 4, rest_until: null, obtained_at: "3" },
];
vi.mock("../db/pg", () => {
  const q = { eq: () => q, then: (ok: (v: unknown) => void) => ok({ data: rows }) };
  return {
    pg: {
      userChipInventory: {
        findOne: async () => ({
          id: "uci_base",
          account_id: "acc1",
          level: 1.5,
          template_id: "a",
          collection_id: "c",
          status: "owned",
          rest_until: null,
        }),
        raw: () => ({ select: () => q }),
      },
    },
    sb: {
      rpc: async (fn: string, a: Record<string, unknown>) => {
        if (fn === "res_move") {
          st.ev.push(`${a.p_kind}:${a.p_delta}:${a.p_ref}`);
          return { error: null };
        }
        st.ev.push(fn);
        st.steps = a.p_steps as Array<Record<string, unknown>>;
        if (st.craftErr) return { data: null, error: { message: st.craftErr } };
        return { data: [{ final_chip_id: "n1", final_level: 2, final_serial: 1 }], error: null };
      },
    },
  };
});
vi.mock("../db/mcpClient", () => ({ mcpExec: async () => [{ amount: st.gold }] }));
vi.mock("./craft-gold-price", () => ({ craftGoldMult: async () => st.mult }));
vi.mock("./chips-craft", () => ({
  CRAFT_RULES: {
    "1": { sacrifices: 1, requireIdentical: true, costGold: 9, targetLabel: "lvl 1.5" },
    "1.5": { sacrifices: 2, requireIdentical: false, costGold: 21, targetLabel: "lvl 2" },
  },
}));
vi.mock("./chips-mint-helpers", () => ({
  requireWallet: () => "w1",
  levelKey: (l: number) => (Number.isInteger(l) ? String(l) : l.toFixed(1)),
}));
vi.mock("../buildGate", () => ({ requireFreshClient: () => {} }));
vi.mock("../chipRest", () => ({ isChipResting: () => false }));
vi.mock("./chips-mint-helpers-mining", () => ({
  getMiningState: async () => ({ slots: {} }),
  settleMiningSlots: async () => {},
  saveMiningState: async () => {},
}));
vi.mock("./user", () => ({ accountOf: async () => "acc1", invalidateTicketsCache: () => {} }));

const mod = await import("./chips-craft-upgrade");
type Fn = (a: { data: unknown }) => Promise<Record<string, unknown>>;
const preview = mod.previewAutoUpgradeChip as unknown as Fn;
const run = mod.autoUpgradeChip as unknown as Fn;

beforeEach(() => {
  Object.assign(st, { ev: [], steps: [], gold: 1000, mult: 1, craftErr: null });
});

describe("авто-улучшение за золото", () => {
  it("превью: стандарт 9 + 21 = 30 золота, баланс и нехватка", async () => {
    expect(await preview({ data: { baseChipId: "uci_base" } })).toMatchObject({
      feasible: true,
      totalGold: 30,
      haveGold: 1000,
      goldShortfall: 0,
    });
    st.gold = 12;
    expect(await preview({ data: { baseChipId: "uci_base" } })).toMatchObject({
      feasible: false,
      feasibleChips: true,
      totalGold: 30,
      goldShortfall: 18,
    });
  });

  it("один множитель на план, каждый шаг вверх: 0,5 → 5 + 11 = 16", async () => {
    st.mult = 0.5;
    expect(await preview({ data: { baseChipId: "uci_base" } })).toMatchObject({ totalGold: 16 });
  });

  it("выполнение: золото до крафта, в шагах для базы cost = 0", async () => {
    const r = await run({ data: { baseChipId: "uci_base", expectGold: 30 } });
    expect(r).toMatchObject({ ok: true, spentGold: 30 });
    expect(st.ev[0]).toMatch(/^craft:-30:upgrade-op:/);
    expect(st.ev[1]).toBe("auto_craft_chip_atomic");
    expect(st.steps).toHaveLength(2);
    for (const s of st.steps) expect(s.cost).toBe(0);
  });

  it("план дороже показанного — отказ без движений", async () => {
    st.mult = 2;
    await expect(run({ data: { baseChipId: "uci_base", expectGold: 30 } })).rejects.toThrow(
      "Цена изменилась — обнови окно",
    );
    expect(st.ev).toEqual([]);
  });

  it("не хватает золота — отказ без движений", async () => {
    st.gold = 29;
    await expect(run({ data: { baseChipId: "uci_base", expectGold: 30 } })).rejects.toThrow(
      "Не хватает золота: нужно 30, у тебя 29",
    );
    expect(st.ev).toEqual([]);
  });

  it("крафт сорвался — возврат тем же ключом (craft_undo)", async () => {
    st.craftErr = "base_level_mismatch";
    await expect(run({ data: { baseChipId: "uci_base", expectGold: 30 } })).rejects.toThrow(
      "Инвентарь изменился",
    );
    const ref = st.ev[0].split(":").slice(2).join(":");
    expect(st.ev[2]).toBe(`craft_undo:30:${ref}`);
  });
});
