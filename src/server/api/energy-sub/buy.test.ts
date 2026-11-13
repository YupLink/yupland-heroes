// Покупка подписки: сначала деньги, потом подписка; сорвалось — возврат;
// повтор нажатия не списывает и не выдаёт дважды, а повтор после возврата
// подписку даром не даёт. База и счёт подменены.
import { beforeEach, describe, expect, it, vi } from "vitest";

const sqls: string[] = [];
const st = {
  applied: true,
  prev: { paid: "16387044", undone: false } as { paid: string | null; undone: boolean },
  createFails: false,
  createError: "MCP timeout",
  /** Своя действующая подписка нового образца — какого тарифа (null — нет). */
  other: null as string | null,
  created: "es_x" as string | null,
  exists: false,
  rate: 2_601_118 as number | null,
};
const pay = vi.fn(async () => ({ balance: 0, applied: st.applied }));
const refund = vi.fn(async () => ({ balance: 0, applied: true }));
const runDue = vi.fn(async () => []);
const grantDue = vi.fn(async () => ({ days: 1, missed: 0, gifts: 2 }));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    type Fn = (ctx: { data: unknown }) => unknown;
    const wrap = (fn: Fn, validate?: (d: unknown) => unknown) => (args?: { data?: unknown }) =>
      fn({ data: validate ? validate(args?.data) : args?.data });
    return {
      handler: (fn: Fn) => wrap(fn),
      inputValidator: (validate: (d: unknown) => unknown) => ({ handler: (fn: Fn) => wrap(fn, validate) }),
    };
  },
}));
vi.mock("../../db/mcpClient", () => ({
  mcpExec: vi.fn(async (sql: string) => {
    const flat = sql.replace(/\s+/g, " ").trim();
    sqls.push(flat);
    if (flat.includes("INSERT INTO yuplink.energy_sub ")) {
      if (st.createFails) throw new Error(st.createError);
      return [{ _row: { created: st.created, existing: st.created } }];
    }
    if (flat.includes("GROUP BY tier_id")) return st.other ? [{ tier_id: st.other, until: "2026-11-28T00:00:00Z" }] : [];
    if (flat.includes("SELECT 1 AS ok FROM yuplink.energy_sub")) return st.exists ? [{ ok: 1 }] : [];
    if (flat.includes("kind = 'acc_spend'")) return [st.prev];
    return null;
  }),
}));
vi.mock("../raid-shared", () => ({ sqlStr: (v: string) => `'${String(v).replace(/'/g, "''")}'` }));
vi.mock("../../maintenance", () => ({ assertNotMaintenance: () => {} }));
vi.mock("../../rateGate", () => ({ moneyGate: async () => {} }));
vi.mock("../account-rollout", () => ({ requireAccountUser: async () => "w1.near" }));
vi.mock("../currency/move", () => ({
  accAccountId: async () => "acc_A",
  accBalance: async () => 100,
}));
vi.mock("../currency/spend", () => ({ payFromAccount: pay, refundToAccount: refund }));
vi.mock("./tiers", () => ({
  canUseSubs: async () => true,
  loadTier: async (id: string) =>
    id === "esub_novice"
      ? { id, name: "Новичок", nameEn: "Novice", priceUsd: 7, energyPerDay: 500, boxPackId: "pk_1", boxesPerDay: 1, days: 30, active: true, noDecay: false }
      : id === "esub_expert"
        ? { id, name: "Эксперт", nameEn: "Expert", priceUsd: 45, energyPerDay: 5000, boxPackId: "pk_1", boxesPerDay: 10, days: 30, active: true, noDecay: true }
        : null,
}));
vi.mock("./rate", () => ({ daraiPerUsd: async () => (st.rate ? { rate: st.rate, ageMs: 0 } : null) }));
vi.mock("./grant", async (orig) => ({ ...(await orig<typeof import("./grant")>()), grantDueForAccount: grantDue }));
vi.mock("./batch", () => ({ runDueBatches: runDue }));

const { buyEnergySub } = await import("./buy");

const buy = (over: Record<string, unknown> = {}) =>
  buyEnergySub({ data: { tierId: "esub_novice", token: "Darai", expected: 16_387_044, opId: "op_12345678", ...over } });

beforeEach(() => {
  sqls.length = 0;
  Object.assign(st, {
    applied: true,
    prev: { paid: "16387044", undone: false },
    createFails: false,
    createError: "MCP timeout",
    other: null,
    created: "es_x",
    exists: false,
    rate: 2_601_118,
  });
  pay.mockClear();
  refund.mockClear();
  runDue.mockClear();
  grantDue.mockClear();
});

describe("покупка подписки", () => {
  it("списывает цену по курсу, пишет подписку, выдаёт день 1 и зовёт пачки", async () => {
    const r = await buy();
    expect(r).toMatchObject({ ok: true, token: "Darai", spent: 16_387_044 });
    expect(pay).toHaveBeenCalledWith(
      expect.objectContaining({ token: "Darai", amount: 16_387_044, ref: "esub:acc_A:esub_novice:Darai:op_12345678" }),
    );
    expect(sqls.some((s) => s.includes("INSERT INTO yuplink.energy_sub "))).toBe(true);
    // Мимо памяти процесса: подписка только что появилась.
    expect(grantDue).toHaveBeenCalledWith("acc_A", { force: true });
    expect(runDue).toHaveBeenCalledWith("auto");
    expect(refund).not.toHaveBeenCalled();
  });

  it("курс вырос сверх 2 % — не списывает, просит подтвердить", async () => {
    await expect(buy({ expected: 15_000_000 })).rejects.toThrow("esub.price_changed");
    expect(pay).not.toHaveBeenCalled();
  });

  it("нет курса — DARAI не продаётся, USDT и Stars — да", async () => {
    st.rate = null;
    await expect(buy()).rejects.toThrow("esub.no_rate");
    expect(pay).not.toHaveBeenCalled();
    await expect(buy({ token: "USDT", expected: 7 })).resolves.toMatchObject({ spent: 7 });
    await expect(buy({ token: "STARS", expected: 593 })).resolves.toMatchObject({ spent: 593 });
  });

  it("нет тарифа — отказ до списания", async () => {
    await expect(buy({ tierId: "nope" })).rejects.toThrow("esub.no_tier");
    expect(pay).not.toHaveBeenCalled();
  });

  it("подписка не записалась — деньги возвращаются тем же ключом", async () => {
    st.createFails = true;
    await expect(buy()).rejects.toThrow("MCP timeout");
    expect(refund).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 16_387_044, ref: "esub:acc_A:esub_novice:Darai:op_12345678" }),
    );
  });

  it("ошибка ответа, но подписка на самом деле есть — возврата нет", async () => {
    st.createFails = true;
    st.exists = true;
    await expect(buy()).rejects.toThrow();
    expect(refund).not.toHaveBeenCalled();
  });

  it("повтор нажатия: второе списание не прошло — подписка по прежней сумме", async () => {
    st.applied = false;
    st.prev = { paid: "16000000", undone: false };
    const r = await buy();
    expect(r.spent).toBe(16_000_000);
    const ins = sqls.find((s) => s.includes("INSERT INTO yuplink.energy_sub "))!;
    expect(ins).toContain("16000000.00000000");
  });

  it("повтор после возврата — отказ, подписки даром нет", async () => {
    st.applied = false;
    st.prev = { paid: "16387044", undone: true };
    await expect(buy()).rejects.toThrow("esub.retry");
    expect(sqls.some((s) => s.includes("INSERT INTO yuplink.energy_sub "))).toBe(false);
  });
});

describe("по одной каждого вида (esub-10)", () => {
  it("такая же действует — отказ до списания", async () => {
    st.other = "esub_novice";
    st.prev = { paid: null, undone: false };
    await expect(buy()).rejects.toThrow("esub.one_active");
    expect(pay).not.toHaveBeenCalled();
    const q = sqls.find((s) => s.includes("GROUP BY tier_id"))!;
    expect(q).toContain("pay_ref IS DISTINCT FROM 'esub:acc_A:esub_novice:Darai:op_12345678'");
    // старый образец (до тарифов esub-07) в лимит не входит
    expect(q).toContain("created_at >= '2026-10-25 00:00:00+00'");
    expect(refund).not.toHaveBeenCalled();
  });

  it("действует другого вида — покупка идёт, подписки складываются", async () => {
    st.other = "esub_expert";
    await expect(buy()).resolves.toMatchObject({ ok: true });
    expect(pay).toHaveBeenCalledOnce();
  });

  it("повтор, чья оплата прошла без подписки, а такая уже действует — деньги назад", async () => {
    st.other = "esub_novice";
    st.prev = { paid: "16000000", undone: false };
    await expect(buy()).rejects.toThrow("esub.one_active");
    expect(pay).not.toHaveBeenCalled();
    expect(refund).toHaveBeenCalledWith(expect.objectContaining({ amount: 16_000_000 }));
  });

  it("повтор, база отказала «одна за раз» — прежнее списание возвращается", async () => {
    st.applied = false;
    st.prev = { paid: "16000000", undone: false };
    st.createFails = true;
    st.createError = "ERROR: esub_one_active";
    await expect(buy()).rejects.toThrow("esub.one_active");
    expect(refund).toHaveBeenCalledWith(expect.objectContaining({ amount: 16_000_000 }));
  });

  it("два нажатия разом — база отказала второй, деньги вернулись", async () => {
    st.createFails = true;
    st.createError = "ERROR: esub_one_active";
    await expect(buy()).rejects.toThrow("esub.one_active");
    expect(refund).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 16_387_044, ref: "esub:acc_A:esub_novice:Darai:op_12345678" }),
    );
  });
});

describe("«Эксперт» — энергия не тает", () => {
  it("перед подпиской энергия досчитывается, у подписки флаг no_decay", async () => {
    await buy({ tierId: "esub_expert", token: "USDT", expected: 45 });
    const touch = sqls.findIndex((x) => x.includes("energy_touch_acc('acc_A', 0)"));
    const ins = sqls.findIndex((x) => x.includes("INSERT INTO yuplink.energy_sub "));
    expect(touch).toBeGreaterThanOrEqual(0);
    expect(touch).toBeLessThan(ins);
    expect(sqls[ins]).toContain("'esub:acc_A:esub_expert:USDT:op_12345678', true");
  });

  it("обычный тариф энергию не трогает, флаг false", async () => {
    await buy();
    expect(sqls.some((x) => x.includes("energy_touch_acc"))).toBe(false);
    expect(sqls.find((x) => x.includes("INSERT INTO yuplink.energy_sub "))).toContain("op_12345678', false");
  });
});
