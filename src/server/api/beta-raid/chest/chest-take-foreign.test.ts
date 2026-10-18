// Чужой берёт из сети магического сундука (владелец, 29.09.2026, четвёртая
// редакция — «подворовывать»): живой охраны нет (или её победили) — «Открыл» за
// энергию и берёт выбранное, сколько влезет; сундук стоит и остаётся в сети
// хозяина. Взятое — «собрано прочее» (loot). Снятие — под локом сети хозяина,
// тем же оператором сверено, что сундук стоит, не закопан и живой охраны нет.
// Класть чужой тоже может (30.09) — chest-store-foreign.test.
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({
  sql: [] as string[],
  deposits: [] as Array<Record<string, unknown>>,
  notes: [] as string[],
  took: true,
  pass: true,
  guarded: false,
  depositFails: false,
}));

vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    if (sql.includes("FROM yuplink.raid_chest_slot") && sql.includes("LIMIT 1")) {
      const snap = { kind: "custom", ref_id: "cst_ore", item_id: null, name: "Руда", image: null };
      return [{ ...snap, count: "30" }];
    }
    if (sql.includes("'chestback:")) return [];
    return [{ _row: { was: false, took: s.took, mv: s.took ? 7 : null } }];
  },
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const fn = { inputValidator: () => fn, handler: (h: unknown) => h };
    return fn;
  },
}));
vi.mock("@/server/api/beta-raid/market-backpack", () => ({
  resolveBackpack: async () => ({ heroId: "h_t", capacity: 10, potionCapacity: 0 }),
  depositToBackpack: async (o: Record<string, unknown>) => {
    if (s.depositFails) throw new Error("market.backpack_full");
    s.deposits.push(o);
  },
}));
vi.mock("@/server/api/beta-raid/chest/chest-net-read", () => ({ loadBag: async () => [] }));
vi.mock("@/server/api/beta-raid/potion-bag", () => ({ potionKeysOf: async () => new Set() }));
vi.mock("@/server/api/beta-raid/item-alias", () => ({
  refFromStackKey: (k: string) => k.slice(k.indexOf(":") + 1),
}));
vi.mock("@/server/api/beta-raid/econ/chest-note", () => ({
  noteChestMove: () => void s.notes.push("move"),
  noteChestSeize: () => void s.notes.push("seize"),
  noteChestLoot: () => void s.notes.push("loot"),
}));
vi.mock("@/server/api/beta-raid/open-pass/pass", () => ({
  requirePass: async () => {
    if (!s.pass) throw new Error("pass.closed");
  },
}));
vi.mock("@/server/api/beta-raid/chest/chest-row", () => ({
  chestActor: async () => ({ wallet: "w_t", mapId: "rmap_x", account: "acc_t" }),
  chestNearAny: async () => {
    if (s.guarded) throw new Error("chest.guarded");
    return { chest: { owner_account: "acc_o" }, mine: false };
  },
  sqlRow: <T>(rows: Array<{ _row: T }> | undefined) => rows?.[0]?._row,
  num: (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0),
}));

const { takeFromChest } = await import("@/server/api/beta-raid/chest/chest-take");
type Fn = (a: { data: object }) => Promise<{ qty: number }>;
const cell = { q: 1, r: 2, stackKey: "custom:cst_ore" };
const take = (qty: number) => (takeFromChest as unknown as Fn)({ data: { ...cell, qty } });
const flat = (x: string) => x.replace(/\s+/g, " ");
const takeSqlOf = () => flat(s.sql.find((x) => x.includes("'chesttake:")) ?? "");

beforeEach(() => {
  Object.assign(s, {
    sql: [],
    deposits: [],
    notes: [],
    took: true,
    pass: true,
    guarded: false,
    depositFails: false,
  });
});

describe("чужой берёт из сети хозяина", () => {
  it("часть стопки — в свой рюкзак с меткой loot; журнал: у хозяина «потерял», у взявшего «унёс»", async () => {
    await expect(take(7)).resolves.toEqual({ ok: true, qty: 7 });
    expect(s.deposits[0]).toMatchObject({ heroId: "h_t", account: "acc_t", qty: 7, origin: "loot" });
    expect(s.notes).toEqual(["seize", "loot"]);
  });

  it("снятие — из сети ХОЗЯИНА под его локом, пока сундук стоит, не закопан и без живой охраны", async () => {
    await take(7);
    const sql = takeSqlOf();
    expect(sql.startsWith("SELECT pg_advisory_xact_lock(hashtext('chest:acc_o')) AS l;")).toBe(true);
    expect(sql).toContain("s.account_id = 'acc_o' AND s.stack_key = 'custom:cst_ore'");
    expect(sql).toContain(
      "AND EXISTS (SELECT 1 FROM yuplink.raid_magic_chest mc WHERE mc.map_id = 'rmap_x' AND mc.q = 1 AND mc.r = 2 AND mc.owner_account = 'acc_o' AND mc.buried_at IS NULL)",
    );
    expect(sql).toContain(
      "AND NOT EXISTS (SELECT 1 FROM yuplink.raid_mine_guard g WHERE g.map_id = 'rmap_x' AND g.q = 1 AND g.r = 2 AND NOT (g.killed_at IS NOT NULL OR g.current_hp <= 0))",
    );
  });

  it("сундук забрали или закопали под рукой — «уже забрали», рюкзак не тронут", async () => {
    s.took = false;
    await expect(take(7)).rejects.toThrow("pchest.taken");
    expect(s.deposits).toEqual([]);
  });

  it("рюкзак не принял — штуки назад в сеть хозяина", async () => {
    s.depositFails = true;
    await expect(take(7)).rejects.toThrow("market.backpack_full");
    const back = flat(s.sql.find((x) => x.includes("'chestback:")) ?? "");
    expect(back).toContain("'acc_o'");
  });

  it("без входа — «Сначала открой»; при живой охране — сначала бой", async () => {
    s.pass = false;
    await expect(take(7)).rejects.toThrow("pass.closed");
    s.pass = true;
    s.guarded = true;
    await expect(take(7)).rejects.toThrow("chest.guarded");
    expect(s.sql.some((x) => x.includes("'chesttake:"))).toBe(false);
  });
});
