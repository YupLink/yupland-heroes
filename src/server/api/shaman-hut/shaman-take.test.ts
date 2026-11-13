// «Взять в рюкзак» (28.10.2026): без HP и урона шаман только для обряда погоды —
// отказ, хижину не трогаем. С характеристиками: место → забрать (свой ключ) →
// положить боссом шаблона (стопка boss:rbt_shaman, вид boss — её ставит в
// охрану прежний placeMineGuard). Не легло — шаман возвращается в хижину.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SHAMAN_ART, SHAMAN_TEMPLATE_ID } from "@/lib/shamanHut";

type Fn = (a: { data: unknown }) => Promise<unknown>;
type Deposit = { heroId: string; item: Record<string, unknown>; qty: number; nonce: string };
const s = vi.hoisted(() => ({
  sql: [] as string[],
  deposits: [] as Deposit[],
  tpl: null as Record<string, unknown> | null,
  count: 2,
  here: true as boolean,
  hero: true as boolean,
  room: true as boolean,
  depositError: null as string | null,
  /** Выдача прошла, но ответ потерялся: ключ выдачи уже стоит. */
  depositLanded: false,
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const wrap = (fn: Fn) => async (a: { data: unknown }) => fn(a ?? { data: undefined });
    return { handler: (fn: Fn) => wrap(fn), inputValidator: () => ({ handler: wrap }) };
  },
}));
vi.mock("@/server/api/beta-raid/gate", () => ({ requireBetaRaid: async () => "w_me" }));
vi.mock("@/server/api/currency/move", () => ({ accAccountId: async () => "acc_me" }));
vi.mock("@/server/api/beta-raid/home-castle", () => ({
  homeCastleStatus: async () => ({ here: s.here ? { kind: "castle" } : null }),
}));
vi.mock("@/server/api/beta-raid/market-backpack", () => ({
  resolveBackpack: async () => (s.hero ? { heroId: "h1", capacity: 10, potionCapacity: 3 } : null),
  stackKeyFor: async (i: { kind: string; refId: string }) => `${i.kind}:${i.refId}`,
  assertBackpackRoom: async () => {
    if (!s.room) throw new Error("market.backpack_need:1:0");
  },
  depositToBackpack: async (d: Deposit) => {
    if (s.depositError) throw new Error(s.depositError);
    s.deposits.push(d);
  },
}));
vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    if (/FROM yuplink.castle_building/.test(sql)) return [{ owned: true }];
    if (/FROM yuplink.raid_boss_template/.test(sql)) return s.tpl ? [s.tpl] : [];
    if (/castle_shaman_take/.test(sql)) {
      const took = s.count > 0;
      if (took) s.count -= 1;
      return [{ _row: { took, remain: s.count } }];
    }
    if (/AS refunded/.test(sql)) {
      if (s.depositLanded) return [{ _row: { refunded: false } }];
      s.count += 1;
      return [{ _row: { refunded: true } }];
    }
    return [];
  },
}));

const { takeShamanToBackpack } = await import("./shaman-take");
const take = () => (takeShamanToBackpack as unknown as Fn)({ data: undefined });
const READY = {
  id: SHAMAN_TEMPLATE_ID,
  name: "Шаман",
  image_url: SHAMAN_ART,
  max_hp: 5000,
  damage: "80-120",
};

beforeEach(() => {
  Object.assign(s, {
    sql: [],
    deposits: [],
    tpl: { ...READY },
    count: 2,
    here: true,
    hero: true,
    room: true,
    depositError: null,
    depositLanded: false,
  });
});

const touchedHut = () => s.sql.some((q) => /castle_shaman_take|AS refunded/.test(q));

describe("«Взять в рюкзак» без характеристик", () => {
  it("HP 0 — отказ, хижина и рюкзак не тронуты", async () => {
    s.tpl = { ...READY, max_hp: 0 };
    await expect(take()).rejects.toThrow("shaman.no_stats");
    expect(touchedHut()).toBe(false);
    expect(s.deposits).toEqual([]);
  });
  it("урон не задан — отказ", async () => {
    s.tpl = { ...READY, damage: null };
    await expect(take()).rejects.toThrow("shaman.no_stats");
    s.tpl = { ...READY, damage: "0" };
    await expect(take()).rejects.toThrow("shaman.no_stats");
    expect(touchedHut()).toBe(false);
  });
  it("шаблона нет — отказ", async () => {
    s.tpl = null;
    await expect(take()).rejects.toThrow("shaman.no_stats");
  });
});

describe("«Взять в рюкзак» с характеристиками", () => {
  it("босс шаблона шамана — в рюкзак выбранного героя, в хижине на одного меньше", async () => {
    expect(await take()).toEqual({ ok: true, count: 1 });
    expect(s.count).toBe(1);
    expect(s.deposits).toHaveLength(1);
    expect(s.deposits[0]).toMatchObject({
      heroId: "h1",
      qty: 1,
      item: { kind: "boss", refId: SHAMAN_TEMPLATE_ID, id: `boss:${SHAMAN_TEMPLATE_ID}` },
    });
    // Ключ забора и ключ выдачи — от одного нажатия.
    const nonce = s.deposits[0].nonce;
    expect(s.sql.find((q) => /castle_shaman_take/.test(q))).toContain(`'${nonce}:take'`);
  });
  it("герой не у замка, нет героя, рюкзак полон — отказ до забора", async () => {
    s.here = false;
    await expect(take()).rejects.toThrow("shaman.at_castle");
    s.here = true;
    s.hero = false;
    await expect(take()).rejects.toThrow("market.need_hero");
    s.hero = true;
    s.room = false;
    await expect(take()).rejects.toThrow("market.backpack_need");
    expect(touchedHut()).toBe(false);
    expect(s.count).toBe(2);
  });
  it("шаманов нет — отказ, рюкзак не тронут", async () => {
    s.count = 0;
    await expect(take()).rejects.toThrow("shaman.none");
    expect(s.deposits).toEqual([]);
  });
  it("не легло в рюкзак — шаман вернулся в хижину, ошибка игроку", async () => {
    s.depositError = "market.backpack_need:1:0";
    await expect(take()).rejects.toThrow("market.backpack_need");
    expect(s.count).toBe(2);
    expect(s.sql.find((q) => /AS refunded/.test(q))).toMatch(/'bp:shaman:[\w-]+'/);
  });
  it("выдача прошла, потерялся ответ — шамана не возвращаем (не задвоить)", async () => {
    s.depositError = "MCP timeout";
    s.depositLanded = true;
    expect(await take()).toEqual({ ok: true, count: 1 });
    expect(s.count).toBe(1);
  });
});
