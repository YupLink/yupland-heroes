// «Починить всё»: цена → подтверждение → починка одной функцией базы. Повтор
// того же подтверждения денег не просит и отвечает той же суммой, нехватка —
// отказ до базы, вне замка — отказ.
import { beforeEach, describe, expect, it, vi } from "vitest";

type Fn = (a: { data: unknown }) => Promise<unknown>;
const NOW = Date.parse("2026-11-05T12:00:00Z");
const H = 3_600_000;
const s = vi.hoisted(() => ({
  sql: [] as string[],
  events: [] as unknown[],
  atCastle: true,
  gold: 100,
  done: false,
  status: "repaired",
  cells: [] as Array<{ map_id: string; q: number; r: number }>,
  saved: null as number | null,
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const wrap = (fn: Fn, v?: (d: unknown) => unknown) => async (a: { data: unknown }) =>
      fn({ data: v ? v(a?.data) : a?.data });
    return {
      handler: (fn: Fn) => wrap(fn),
      inputValidator: (v: (d: unknown) => unknown) => ({ handler: (fn: Fn) => wrap(fn, v) }),
    };
  },
}));
vi.mock("@/server/api/beta-raid/gate", () => ({ requireBetaRaid: async () => "w_me" }));
vi.mock("@/server/api/currency/move", () => ({ accAccountId: async () => "acc_me" }));
vi.mock("@/server/rateGate", () => ({ actionGate: async () => {} }));
vi.mock("@/server/api/castle-townhall/free-build", () => ({ hasCastleBuilding: async () => true }));
vi.mock("@/server/api/beta-raid/castle", () => ({
  requireAtCastle: async () => {
    if (!s.atCastle) throw new Error("Это делается в замке — дойди до замка");
  },
}));
vi.mock("@/server/api/beta-raid/voidGate", () => ({
  canIgnoreVoid: () => false,
  requireNotVoid: async () => {},
}));
vi.mock("@/server/api/achievements/bump", () => ({ bumpAchievement: () => {} }));
vi.mock("@/server/raidLive", () => ({ publishRaid: (e: unknown) => void s.events.push(e) }));
vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    if (/FROM yuplink.raid_floor f/.test(sql)) return s.cells;
    if (/FROM yuplink.account_view/.test(sql)) return [{ below: s.saved }];
    if (/INSERT INTO yuplink.account_view/.test(sql)) return [];
    if (/account_resources/.test(sql)) return [{ resource: "gold", amount: s.gold }];
    if (/raid_mine_repair_all\(/.test(sql)) {
      return s.cells.map((c) => ({
        ...c,
        status: s.status,
        captured: false,
        credited: 2,
        credited_to: "acc_me",
        cost: { gold: 20 },
      }));
    }
    if (/AS island_spent/.test(sql)) {
      return s.cells.map((c) => ({
        ...c,
        owner: "acc_me",
        mode: "base",
        life_left: 0.5,
        life_at: NOW - H,
        v2: true,
        cfg: { resource: "wood" },
        void: false,
        island_spent: false,
        done: s.done && /'rep:/.test(sql),
      }));
    }
    return [];
  },
}));

const { getMineRepairAllQuote, repairAllMines } = await import("./mine-office-repair-all");
const call = (f: unknown, data?: unknown) => (f as Fn)({ data });
const repairs = () => s.sql.filter((x) => /raid_mine_repair_all\(/.test(x));
type Quote = { cells: unknown[]; total: unknown; short: unknown; mines: unknown[] };

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  s.sql = [];
  s.events = [];
  s.atCastle = true;
  s.gold = 100;
  s.done = false;
  s.status = "repaired";
  s.saved = null;
  s.cells = [
    { map_id: "rmap_a", q: 1, r: 1 },
    { map_id: "rmap_b", q: 2, r: 2 },
  ];
});

describe("getMineRepairAllQuote", () => {
  it("цена всех своих работающих, клетки для подтверждения с отметкой запаса", async () => {
    const q = (await call(getMineRepairAllQuote)) as Quote;
    expect(q.total).toEqual({ gold: 40 });
    expect(q.short).toEqual({});
    expect(q.cells).toEqual([
      { mapId: "rmap_a", q: 1, r: 1, lifeAt: NOW - H },
      { mapId: "rmap_b", q: 2, r: 2, lifeAt: NOW - H },
    ]);
    expect(repairs()).toHaveLength(0);
  });

  it("порог ползунка: ниже 40 % — шахты на ~49 % пропущены как полные; порог в ответе", async () => {
    const q = (await call(getMineRepairAllQuote, { below: 0.4 })) as Quote & {
      below: number;
      skipped: Array<{ reason: string }>;
    };
    expect(q.below).toBe(0.4);
    expect(q.cells).toEqual([]);
    expect(q.skipped.map((x) => x.reason)).toEqual(["full", "full"]);
    const def = (await call(getMineRepairAllQuote)) as Quote & { below: number };
    expect(def.below).toBe(0.9);
    const wild = (await call(getMineRepairAllQuote, { below: 7 })) as Quote & { below: number };
    expect(wild.below).toBe(1);
  });

  it("без порога — сохранённый (или 90 %), с порогом — присланный", async () => {
    s.saved = 0.35;
    const q = (await call(getMineRepairAllQuote)) as Quote & { below: number };
    expect(q.below).toBe(0.35);
    const p = (await call(getMineRepairAllQuote, { below: 0.8 })) as Quote & { below: number };
    expect(p.below).toBe(0.8);
  });

  it("не хватает — сколько именно", async () => {
    s.gold = 25;
    expect(((await call(getMineRepairAllQuote)) as Quote).short).toEqual({ gold: 15 });
  });

  it("своих шахт нет — пусто и без запроса состояния", async () => {
    s.cells = [];
    const q = (await call(getMineRepairAllQuote)) as Quote;
    expect(q).toMatchObject({ mines: [], total: {}, cells: [] });
  });
});

describe("repairAllMines", () => {
  const cells = () => [
    { mapId: "rmap_a", q: 1, r: 1, lifeAt: NOW - H },
    { mapId: "rmap_b", q: 2, r: 2, lifeAt: NOW - H },
  ];
  type Res = { charged: unknown; repaired: unknown[]; skipped: Array<{ reason: string }> };

  it("чинит одной функцией базы, ключ клетки от показанной отметки, рассылка по картам", async () => {
    const res = (await call(repairAllMines, { cells: cells() })) as Res;
    expect(repairs()).toHaveLength(1);
    expect(repairs()[0]).toContain(`"op":"rep:acc_me:all:rmap_a:1,1:${NOW - H}"`);
    expect(res.charged).toEqual({ gold: 40 });
    expect(res.repaired).toHaveLength(2);
    expect(s.events).toHaveLength(2);
  });

  it("повтор того же подтверждения: денег не проверяет, сумма та же, рассылка повторяется", async () => {
    s.done = true;
    s.status = "again";
    s.gold = 0;
    const res = (await call(repairAllMines, { cells: cells() })) as Res;
    expect(res.charged).toEqual({ gold: 40 });
    expect(s.sql.some((x) => /account_resources/.test(x))).toBe(false);
    expect(s.events).toHaveLength(2);
  });

  it("починка запоминает порог на аккаунте (с телефона на ПК)", async () => {
    await call(repairAllMines, { cells: cells(), below: 0.7 });
    const save = s.sql.find((x) => /INSERT INTO yuplink.account_view/.test(x)) ?? "";
    expect(save).toContain("VALUES ('acc_me', 0.7)");
    expect(save).toContain("mine_repair_below = EXCLUDED.mine_repair_below");
  });

  it("порог из подтверждения: выше запаса шахт — ничего не чинит", async () => {
    const res = (await call(repairAllMines, { cells: cells(), below: 0.2 })) as Res;
    expect(res.skipped.map((x) => x.reason)).toEqual(["full", "full"]);
    expect(repairs()).toHaveLength(0);
  });

  it("старое подтверждение (отметка запаса другая) — пропуск до базы", async () => {
    const stale = cells().map((c) => ({ ...c, lifeAt: NOW - 5 * H }));
    const res = (await call(repairAllMines, { cells: stale })) as Res;
    expect(res.skipped.map((x) => x.reason)).toEqual(["changed", "changed"]);
    expect(repairs()).toHaveLength(0);
  });

  it("база под локом пропустила (одновременное подтверждение) — ничего не списано", async () => {
    s.status = "changed";
    const res = (await call(repairAllMines, { cells: cells() })) as Res;
    expect(res.charged).toEqual({});
    expect(res.repaired).toEqual([]);
    expect(res.skipped.map((x) => x.reason)).toEqual(["changed", "changed"]);
    expect(s.events).toHaveLength(0);
  });

  it("не хватает ресурсов — отказ до базы, ничего не чинит", async () => {
    s.gold = 30;
    await expect(call(repairAllMines, { cells: cells() })).rejects.toThrow(
      /braid\.mine_short_gold/,
    );
    expect(repairs()).toHaveLength(0);
  });

  it("вне замка — отказ; пустой список — отказ схемы", async () => {
    s.atCastle = false;
    await expect(call(repairAllMines, { cells: cells() })).rejects.toThrow(/замк/);
    s.atCastle = true;
    await expect(call(repairAllMines, { cells: [] })).rejects.toThrow();
    expect(repairs()).toHaveLength(0);
  });
});
