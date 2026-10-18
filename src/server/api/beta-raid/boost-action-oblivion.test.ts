// Алтарь с «Забвением»: бесплатный такой алтарь не выдаёт ничего — иначе уровни
// забвения раздавались бы даром и без счёта (то самое даровое забвение, которое
// владелец отменил 27.09). Платный — выдаёт, и повтор не упирается в «ещё
// действует»: уровни складываются.
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({
  cfg: null as unknown,
  paid: [] as string[],
  applied: [] as Array<{ stat: string; amount: number; minutes: number }>,
  ops: new Set<string>(),
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const fn = { inputValidator: () => fn, handler: (h: unknown) => h };
    return fn;
  },
}));
vi.mock("./gate", () => ({ requireBetaRaid: async () => "w1" }));
vi.mock("./encounter-where", () => ({
  myMapId: async () => "map1",
  playerCell: async () => ({ q: 0, r: 0 }),
  requireAdjacent: () => {},
}));
vi.mock("./voidGate", () => ({ requireNotVoid: async () => {} }));
vi.mock("./hero-current", () => ({
  selectedHeroRow: async () => ({ id: "h_me", name: "Воин" }),
}));
vi.mock("./building-action", () => ({
  loadCellBuilding: async () => ({
    effect: "boost",
    tier: 1,
    tiers: [{}, {}],
    config: { boost: s.cfg },
    meta: {},
  }),
}));
vi.mock("./boost-extra", () => ({ boostSource: () => "cell:map1:1,2" }));
vi.mock("./hero-boost", () => ({
  claimBoostOp: async ({ op }: { op: string }) => !s.ops.has(op) && !!s.ops.add(op),
  releaseBoostOp: async (op: string) => void s.ops.delete(op),
  boostOpAmount: async () => 0,
}));
vi.mock("./hero-buff", () => ({
  loadBuffsFor: async () => ({}),
  applyBoostRoll: async (_w: string, r: { stat: string; amount: number; minutes: number }) =>
    void s.applied.push({ stat: r.stat, amount: r.amount, minutes: r.minutes }),
}));
vi.mock("./hero-immune", () => ({ loadImmuneTargetsFor: async () => new Set() }));
vi.mock("./resource-pay", () => ({
  payResources: async (_w: string, _p: unknown, ref: string) => void s.paid.push(ref),
  refundResources: async () => {},
}));
vi.mock("./econ/trade-hooks", () => ({ noteEnergyInPrices: async () => {} }));
vi.mock("./hero-power", () => ({ invalidateHeroPower: () => {} }));

import * as action from "./boost-action";
import { freeOblivion } from "@/lib/boostConfig";

const take = action.takeBuildingBoost as unknown as (a: {
  data: Record<string, unknown>;
}) => Promise<{ ok: true; repeat: boolean }>;
const obl = { stat: "oblivion", value: "1", minutes: "" };
const gold = { resource: "gold", amount: 30 };

beforeEach(() => {
  s.paid = [];
  s.applied = [];
  s.ops = new Set();
});

describe("алтарь с «Забвением»", () => {
  it("бесплатный — отказ, ничего не выдано", async () => {
    s.cfg = { effects: [obl], prices: [] };
    await expect(take({ data: { q: 1, r: 2, op: "op000001" } })).rejects.toThrow(
      "oblivion.not_set",
    );
    expect(s.applied).toEqual([]);
    expect(freeOblivion({ effects: [obl] as never, prices: [] })).toBe(true);
  });

  it("платный — платит и выдаёт, повтор (другое нажатие) тоже можно: уровни складываются", async () => {
    s.cfg = { effects: [obl], prices: [gold] };
    await take({ data: { q: 1, r: 2, op: "op000002" } });
    await take({ data: { q: 1, r: 2, op: "op000003" } });
    expect(s.paid).toEqual(["boost:op000002", "boost:op000003"]);
    expect(s.applied).toEqual([
      { stat: "oblivion", amount: 1, minutes: 0 },
      { stat: "oblivion", amount: 1, minutes: 0 },
    ]);
  });

  it("платный, «0» и время — безлимит на время; «N» и время — заряды со сроком", async () => {
    s.cfg = {
      effects: [
        { stat: "oblivion", value: "0", minutes: "30" },
        { stat: "oblivion", value: "2", minutes: "15" },
      ],
      prices: [gold],
    };
    await take({ data: { q: 1, r: 2, op: "op000005" } });
    expect(s.applied).toEqual([
      { stat: "oblivion", amount: 0, minutes: 30 },
      { stat: "oblivion", amount: 2, minutes: 15 },
    ]);
  });

  it("неверное забвение, уже лежащее в базе, не выдаётся — соседний эффект выдаётся", async () => {
    s.cfg = {
      effects: [
        { stat: "oblivion", value: "0", minutes: "" },
        { stat: "spd", value: "1", minutes: "30" },
      ],
      prices: [gold],
    };
    await take({ data: { q: 1, r: 2, op: "op000006" } });
    expect(s.applied).toEqual([{ stat: "spd", amount: 1, minutes: 30 }]);
    // Было только оно — алтарь не настроен, денег не берём.
    s.cfg = { effects: [{ stat: "oblivion", value: "", minutes: "" }], prices: [gold] };
    s.paid = [];
    await expect(take({ data: { q: 1, r: 2, op: "op000007" } })).rejects.toThrow();
    expect(s.paid).toEqual([]);
  });

  it("бесплатный алтарь без забвения работает как раньше", async () => {
    s.cfg = { effects: [{ stat: "spd", value: "1", minutes: "30" }], prices: [] };
    await take({ data: { q: 1, r: 2, op: "op000004" } });
    expect(s.applied).toHaveLength(1);
  });
});
