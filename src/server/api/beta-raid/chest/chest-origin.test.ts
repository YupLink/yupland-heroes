// Метки у сундука (ПРАВИЛА §8.15/§8.18, 29.09.2026): сеть меток не хранит, и
// всё, что из неё уходит, — «собрано прочее» (loot): забор владельцем в
// рюкзак (и чужим — chest-take-foreign.test.ts). Забор — девять знаков:
// собранная крошка сети забирается, а не застревает. Базы нет: mcpExec
// подменён, проверяем выдачу и текст оператора.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { dec } from "@/test/numeric";
import { evalSql } from "@/test/sqlExpr";

const s = vi.hoisted(() => ({
  sql: [] as string[],
  deposits: [] as Array<Record<string, unknown>>,
  /** Сколько лежит в строке сети (как отдаёт база) и сколько снимет оператор. */
  count: "12",
  mv: 12,
}));

vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    if (sql.includes("FROM yuplink.raid_chest_slot") && sql.includes("LIMIT 1")) {
      const snap = { kind: "custom", ref_id: "cst_ore", item_id: null, name: "Руда", image: null };
      return [{ ...snap, count: s.count }];
    }
    return [{ _row: { was: false, took: true, mv: s.mv } }];
  },
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const fn = { inputValidator: () => fn, handler: (h: unknown) => h };
    return fn;
  },
}));
vi.mock("@/server/api/beta-raid/market-backpack", () => ({
  resolveBackpack: async () => ({ heroId: "h1", capacity: 10, potionCapacity: 0 }),
  depositToBackpack: async (o: Record<string, unknown>) => void s.deposits.push(o),
}));
vi.mock("@/server/api/beta-raid/chest/chest-net-read", () => ({ loadBag: async () => [] }));
vi.mock("@/server/api/beta-raid/potion-bag", () => ({ potionKeysOf: async () => new Set() }));
vi.mock("@/server/api/beta-raid/item-alias", () => ({
  refFromStackKey: (k: string) => k.slice(k.indexOf(":") + 1),
}));
vi.mock("@/server/api/beta-raid/econ/chest-note", () => ({ noteChestMove: () => {} }));
vi.mock("@/server/api/beta-raid/open-pass/pass", () => ({ requirePass: async () => {} }));
vi.mock("@/server/api/beta-raid/chest/chest-row", () => ({
  chestActor: async () => ({ wallet: "w1", mapId: "rmap_x", account: "acc_o" }),
  chestNearAny: async () => ({ chest: { owner_account: "acc_o" }, mine: true }),
  sqlRow: <T>(rows: Array<{ _row: T }> | undefined) => rows?.[0]?._row,
  num: (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0),
}));

const { takeFromChest } = await import("@/server/api/beta-raid/chest/chest-take");
const flat = (x: string) => x.replace(/\s+/g, " ");
const take = takeFromChest as unknown as (a: { data: object }) => Promise<{ qty: number }>;
const takeSqlOf = () => flat(s.sql.find((x) => x.includes("'chesttake:")) ?? "");

beforeEach(() => {
  s.sql = [];
  s.deposits = [];
  s.count = "12";
  s.mv = 12;
});

describe("из сети — «собрано прочее»", () => {
  it("забор из своего сундука кладёт в рюкзак с меткой loot — можно положить обратно", async () => {
    await expect(
      take({ data: { q: 1, r: 2, stackKey: "custom:cst_ore", qty: 12 } }),
    ).resolves.toEqual({ ok: true, qty: 12 });
    expect(s.deposits).toHaveLength(1);
    expect(s.deposits[0]).toMatchObject({ qty: 12, origin: "loot" });
    expect(s.deposits[0]).not.toHaveProperty("mob");
  });

  it("свой забор — сундук стоит и не закопан тем же оператором; охрана хозяину не помеха", async () => {
    await take({ data: { q: 1, r: 2, stackKey: "custom:cst_ore", qty: 12 } });
    expect(takeSqlOf()).toContain(
      "AND EXISTS (SELECT 1 FROM yuplink.raid_magic_chest mc WHERE mc.map_id = 'rmap_x' AND mc.q = 1 AND mc.r = 2 AND mc.owner_account = 'acc_o' AND mc.buried_at IS NULL)",
    );
    expect(takeSqlOf()).not.toContain("raid_mine_guard");
  });
});

describe("забор из сети — девять знаков", () => {
  it("крошка 0,000454 забирается целиком, а не «пропала» тысячными", async () => {
    s.count = "0.000454";
    s.mv = 0.000454;
    const cell = { q: 1, r: 2, stackKey: "custom:cst_ore", qty: 0.000454 };
    await expect(take({ data: cell })).resolves.toEqual({ ok: true, qty: 0.000454 });
    expect(takeSqlOf()).toContain("s.count - 0.000454 > -0.000000001");
    expect(s.deposits[0]).toMatchObject({ qty: 0.000454, origin: "loot" });
  });

  it("длинная дробь базы против девяти знаков окна — условие забора проходит", async () => {
    s.count = "2.14303321991582606";
    s.mv = 2.143033219915826;
    await take({ data: { q: 1, r: 2, stackKey: "custom:cst_ore", qty: 2.14303322 } });
    const cond = /s\.count - ([\d.]+) > -0\.000000001/.exec(takeSqlOf());
    expect(cond?.[1]).toBe("2.14303322");
    const left = evalSql(`s.count - ${cond?.[1]}`, { "s.count": dec(s.count) });
    expect(left > -dec("0.000000001")).toBe(true);
  });
});
