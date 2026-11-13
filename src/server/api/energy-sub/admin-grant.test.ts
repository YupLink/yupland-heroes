// Выдача подписки админом: поиск игрока по кошельку / Telegram ID / @username,
// подписка на аккаунт без денег (сумма 0, 'GRANT'), повтор нажатия не выдаёт
// вторую, день 1 — сразу в подарки.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sqls: string[] = [];
const st = { created: "es_x" as string | null, account: true };
const grantDue = vi.fn(async () => ({ days: 1, missed: 0, gifts: 2 }));
const notify = vi.fn(async () => 1);

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    type Fn = (ctx: { data: unknown }) => unknown;
    const wrap = (fn: Fn, validate?: (d: unknown) => unknown) => (args?: { data?: unknown }) =>
      fn({ data: validate ? validate(args?.data) : args?.data });
    return {
      handler: (fn: Fn) => wrap(fn),
      inputValidator: (validate: (d: unknown) => unknown) => ({
        handler: (fn: Fn) => wrap(fn, validate),
      }),
    };
  },
}));
vi.mock("../../db/mcpClient", () => ({
  mcpExec: vi.fn(async (sql: string) => {
    const flat = sql.replace(/\s+/g, " ").trim();
    sqls.push(flat);
    if (flat.startsWith("SELECT a.id, COALESCE(a.active_wallet"))
      return st.account ? [{ id: "acc_A", wallet: "p.tg" }] : [];
    if (flat.startsWith("WITH ins AS")) return [{ _row: { id: st.created } }];
    return [];
  }),
}));
vi.mock("../raid-shared", () => ({ sqlStr: (v: string) => `'${String(v).replace(/'/g, "''")}'` }));
const money = vi.hoisted(() => ({ box: false, payouts: true }));
vi.mock("../../auth", () => ({
  requireAdmin: () => "owner.tg",
  requirePayoutsAdmin: () => {
    if (!money.payouts) throw new Error("только для владельца");
    return "owner.tg";
  },
}));
vi.mock("../mystic-money", () => ({ packPaysMoney: async () => money.box }));
vi.mock("./tiers", () => ({
  loadTier: async (id: string) =>
    id === "esub_expert"
      ? {
          id,
          name: "Эксперт",
          nameEn: "Expert",
          priceUsd: 45,
          energyPerDay: 5000,
          boxPackId: "cp_eu1k2rl8yG",
          boxesPerDay: 10,
          days: 30,
          active: true,
          sort: 3,
          boxName: "Bonus Box",
          boxImage: null,
          noDecay: true,
        }
      : null,
}));
vi.mock("./grant", async (orig) => ({
  ...(await orig<typeof import("./grant")>()),
  grantDueForAccount: grantDue,
}));
vi.mock("../gifts-notify", () => ({ notifyGifts: notify }));

const { adminGrantSubscription, targetWhere } = await import("./admin-grant");

beforeEach(() => {
  sqls.length = 0;
  st.created = "es_x";
  st.account = true;
  grantDue.mockClear();
  notify.mockClear();
});

const grant = (over: Record<string, unknown> = {}) =>
  adminGrantSubscription({
    data: { tierId: "esub_expert", days: 7, accountId: "acc_A", opId: "op_12345678", ...over },
  });

afterEach(() => {
  money.box = false;
  money.payouts = true;
});

describe("поиск игрока", () => {
  it("Telegram ID, @username, имя без точки, кошелёк, неявный адрес", () => {
    expect(targetWhere("987654321")).toBe(
      "(u.telegram_id = 987654321 OR a.telegram_id = 987654321)",
    );
    expect(targetWhere("@Player_1")).toBe("lower(u.telegram_username) = lower('Player_1')");
    expect(targetWhere("player_1")).toBe("lower(u.telegram_username) = lower('player_1')");
    expect(targetWhere("i987654321.tg")).toBe("lower(u.wallet) = lower('i987654321.tg')");
    const hex = "a".repeat(64);
    expect(targetWhere(hex)).toBe(`lower(u.wallet) = lower('${hex}')`);
    expect(targetWhere("x'; DROP")).toContain("'x''; DROP'");
  });
});

describe("выдача подписки", () => {
  it("на аккаунт, без денег, на заданные дни, снимок тарифа; день 1 и письмо сразу", async () => {
    const r = await grant();
    expect(r).toMatchObject({ ok: true, created: true, gifts: 2 });
    const ins = sqls.find((s) => s.startsWith("WITH ins AS"))!;
    expect(ins).toContain("'GRANT', 0, 0, NULL");
    expect(ins).toContain("5000, 'cp_eu1k2rl8yG', 10, 7");
    expect(ins).toContain("now() + 7 * interval '1 day'");
    expect(ins).toContain("'grant:op_12345678', 'owner.tg', true");
    // «Эксперт»: энергия досчитана до старта подписки без таяния
    expect(sqls.findIndex((x) => x.includes("energy_touch_acc('acc_A', 0)"))).toBeLessThan(
      sqls.findIndex((x) => x.startsWith("WITH ins AS")),
    );
    expect(ins).toContain("ON CONFLICT (pay_ref) DO NOTHING");
    expect(sqls.some((s) => s.includes("money_bucket_move") || s.includes("darai_pool_move"))).toBe(
      false,
    );
    expect(grantDue).toHaveBeenCalledWith("acc_A", { force: true });
    // Письмо — «начисление по подписке» с именем тарифа (владелец 25.10.2026).
    expect(notify).toHaveBeenCalledWith([
      { accountId: "acc_A", esubTier: { ru: "Эксперт", en: "Expert" } },
    ]);
  });

  it("повтор того же нажатия — второй подписки нет, письма нет", async () => {
    st.created = null;
    const r = await grant();
    expect(r.created).toBe(false);
    expect(notify).not.toHaveBeenCalled();
  });

  it("нет тарифа / нет аккаунта / дни вне 1–366 — отказ", async () => {
    await expect(grant({ tierId: "nope" })).rejects.toThrow("Такого тарифа нет");
    st.account = false;
    await expect(grant()).rejects.toThrow("Аккаунт не найден");
    await expect((async () => grant({ days: 0 }))()).rejects.toThrow();
    await expect((async () => grant({ days: 400 }))()).rejects.toThrow();
  });
  it("бокс тарифа с DARAI — дарит только админ выплат", async () => {
    money.box = true;
    money.payouts = false;
    await expect(grant({ opId: "op_money_1" })).rejects.toThrow("владельца");
  });
});
