// Статистика пулов банка — только админу; журналы базы превращаются в события,
// история идёт порциями с курсором «время|id», откуп — без ника.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BankPool } from "@/lib/castleBank";

const st = vi.hoisted(() => ({
  admin: true,
  sql: [] as string[],
  rows: [] as unknown[],
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    type Fn = (ctx: { data: unknown }) => unknown;
    const wrap = (fn: Fn, v?: (d: unknown) => unknown) => async (a?: { data?: unknown }) =>
      fn({ data: v ? v(a?.data) : a?.data });
    return {
      handler: (fn: Fn) => wrap(fn),
      inputValidator: (v: (d: unknown) => unknown) => ({ handler: (fn: Fn) => wrap(fn, v) }),
    };
  },
}));
vi.mock("../../auth", () => ({
  requireAdmin: () => {
    if (!st.admin) throw new Error("Доступ запрещён: требуется admin-кошелёк");
    return "admin.near";
  },
}));
vi.mock("../raid-shared", () => ({ sqlStr: (v: string) => `'${v.replace(/'/g, "''")}'` }));
vi.mock("../beta-raid/econ/names", () => ({
  displayNames: async (ids: string[]) =>
    new Map(ids.map((id) => [id, { displayName: `@${id}`, telegramUsername: id }])),
}));
const POOL: BankPool = {
  id: "bp_946bb570fec1",
  tokenA: "gold",
  tokenB: "Darai",
  weightA: 1,
  weightB: 200,
  reserveA: 1098,
  reserveB: 181_818.18181818,
  feePct: 10,
  createdAt: "2026-10-17T00:00:00Z",
};
vi.mock("./bank-pools", () => ({ listPools: async () => [POOL] }));
vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    st.sql.push(sql);
    return st.rows;
  },
}));

const { getBankPoolStats, listBankSwapHistory, toEvent, eventsSql, historySql, HISTORY_PAGE } =
  await import("./bank-stats");

beforeEach(() => {
  st.admin = true;
  st.sql = [];
  st.rows = [];
});

describe("доступ", () => {
  it("не админу — отказ и без похода в базу", async () => {
    st.admin = false;
    await expect(getBankPoolStats({ data: { poolId: POOL.id } })).rejects.toThrow(/admin/);
    await expect(listBankSwapHistory({ data: { poolId: POOL.id } })).rejects.toThrow(/admin/);
    expect(st.sql).toEqual([]);
  });

  it("кривой id пула не проходит проверку", async () => {
    await expect(getBankPoolStats({ data: { poolId: "x'; DROP" } })).rejects.toThrow();
  });

  it("чужой пул — «Пул не найден»", async () => {
    await expect(getBankPoolStats({ data: { poolId: "bp_nope" } })).rejects.toThrow(
      "Пул не найден",
    );
  });
});

describe("события из журналов", () => {
  it("наполнение, обмен, откуп; мусор отбрасывается", () => {
    expect(
      toEvent({
        k: "fund",
        at: "2026-10-20T00:00:00+00:00",
        ti: null,
        ai: "10",
        ao: 2000,
        fp: 0,
        fm: 0,
      }),
    ).toEqual({
      kind: "fund",
      at: Date.parse("2026-10-20T00:00:00Z"),
      a: 10,
      b: 2000,
    });
    expect(
      toEvent({
        k: "swap",
        at: "2026-10-20T01:00:00.123456+00:00",
        ti: "gold",
        ai: 100,
        ao: "18000.5",
        fp: "8.0000",
        fm: 2,
      }),
    ).toMatchObject({
      kind: "swap",
      tokenIn: "gold",
      amountIn: 100,
      amountOut: 18000.5,
      feePool: 8,
      feeMap: 2,
    });
    expect(toEvent({ k: "swap", at: "нет", ti: "gold", ai: 1, ao: 1, fp: 0, fm: 0 })).toBeNull();
    expect(
      toEvent({ k: "swap", at: "2026-10-20T00:00:00Z", ti: "", ai: 1, ao: 1, fp: 0, fm: 0 }),
    ).toBeNull();
    // С 25.10.2026 пулы с любыми монетами: обмен USDT — настоящее событие.
    expect(
      toEvent({ k: "swap", at: "2026-10-20T00:00:00Z", ti: "USDT", ai: 1, ao: 1, fp: 0, fm: 0 }),
    ).toMatchObject({ kind: "swap", tokenIn: "USDT" });
  });

  it("откуп берётся только для пула «золото → DARAI»", () => {
    expect(eventsSql(POOL)).toMatch(/bank_buyback/);
    expect(eventsSql({ ...POOL, id: "bp_w", tokenB: "wood" })).not.toMatch(/bank_buyback/);
    expect(historySql({ ...POOL, tokenB: "stone" }, null, 30)).not.toMatch(/bank_buyback/);
  });

  it("сводка считается по журналу и сверяется с запасом", async () => {
    st.rows = [
      { k: "fund", at: "2026-10-20T00:00:00+00:00", ti: null, ai: 1000, ao: 200_000, fp: 0, fm: 0 },
      {
        k: "swap",
        at: "2026-10-20T01:00:00+00:00",
        ti: "gold",
        ai: 100,
        ao: 18_181.81818182,
        fp: 8,
        fm: 2,
      },
    ];
    const r = await getBankPoolStats({ data: { poolId: POOL.id } });
    expect(r.pool.id).toBe(POOL.id);
    expect(r.consistent).toBe(true);
    expect(r.a.feePool.all).toBe(8);
    expect(r.a.feeMap.all).toBe(2);
    expect(r.pointsTotal).toBe(2);
    expect(r.points).toHaveLength(2);
  });
});

describe("история обменов", () => {
  const row = (i: number, acc: string | null) => ({
    id: `bs_${String(i).padStart(4, "0")}`,
    at: `2026-10-21T10:${String(59 - (i % 60)).padStart(2, "0")}:00.123456+00:00`,
    acc,
    bb: acc === null,
    ti: acc ? "gold" : "Darai",
    ai: 10,
    to: acc ? "Darai" : "gold",
    ao: 1800,
    fp: 0.8,
    fm: 0.2,
  });

  it("порция + курсор на следующую; ник игрока, у откупа — без ника", async () => {
    st.rows = Array.from({ length: HISTORY_PAGE + 1 }, (_, i) => row(i, i === 1 ? null : "acc_A"));
    const r = await listBankSwapHistory({ data: { poolId: POOL.id } });
    expect(r.items).toHaveLength(HISTORY_PAGE);
    expect(r.items[0]).toMatchObject({
      who: "@acc_A",
      buyback: false,
      tokenIn: "gold",
      tokenOut: "Darai",
      feeMap: 0.2,
    });
    expect(r.items[1]).toMatchObject({ who: null, buyback: true });
    const last = st.rows[HISTORY_PAGE - 1] as { at: string; id: string };
    expect(r.next).toBe(`${last.at}|${last.id}`);
    expect(st.sql[0]).toMatch(new RegExp(`LIMIT ${HISTORY_PAGE + 1}`));
  });

  it("последняя порция — next=null; курсор уходит в условие", async () => {
    st.rows = [row(0, "acc_A")];
    const cursor = "2026-10-21T10:00:00.123456+00:00|bs_0001";
    const r = await listBankSwapHistory({ data: { poolId: POOL.id, cursor } });
    expect(r.next).toBeNull();
    expect(st.sql[0]).toContain(
      "(h.at, h.id) < ('2026-10-21T10:00:00.123456+00:00'::timestamptz, 'bs_0001')",
    );
  });

  it("курсор с кавычками не проходит проверку", async () => {
    await expect(
      listBankSwapHistory({ data: { poolId: POOL.id, cursor: "2026-10-21'|x" } }),
    ).rejects.toThrow();
    expect(st.sql).toEqual([]);
  });
});
