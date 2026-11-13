// Ручка «Посадить» гриб DARAI поверх фейковой базы: клетка — герой + dq/dr,
// только своя или соседняя, не на острове, проход проверен, 5 энергии тем же
// оператором, ключ нажатия, повтор не ставит второй, отказ — ключом словаря,
// клетку узнают все.
import { beforeEach, describe, expect, it, vi } from "vitest";

type Fn = (a: { data: unknown }) => Promise<unknown>;
const s = vi.hoisted(() => ({
  sql: [] as string[],
  row: null as Record<string, unknown> | null,
  execError: null as string | null,
  op: null as Record<string, unknown> | null,
  opQueue: [] as Array<Record<string, unknown> | null>,
  mapId: "rmap_1",
  pos: { q: 10, r: 5 },
  choke: null as string | null,
  announced: [] as unknown[],
  notes: [] as number[],
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const wrap = (fn: Fn, v?: (d: unknown) => unknown) => async (a: { data: unknown }) =>
      fn({ data: v ? v(a.data) : a.data });
    return {
      handler: (fn: Fn) => wrap(fn),
      inputValidator: (v: (d: unknown) => unknown) => ({ handler: (fn: Fn) => wrap(fn, v) }),
    };
  },
}));
vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    if (/WITH prior AS/.test(sql)) {
      if (s.execError) throw new Error(s.execError);
      return s.row ? [{ _row: s.row }] : [];
    }
    return [];
  },
}));
vi.mock("@/server/api/beta-raid/dmine/dmine-announce", () => ({
  loadDmineOp: async () => (s.opQueue.length > 0 ? s.opQueue.shift() : s.op),
  announceDmine: async (row: unknown) => {
    s.announced.push(row);
    return true;
  },
}));
vi.mock("@/server/api/beta-raid/plain-chest/pchest-row", () => ({
  pchestActor: async () => ({ wallet: "w1.tg", mapId: s.mapId, account: "acc_1" }),
}));
vi.mock("@/server/api/beta-raid/market-backpack", () => ({
  resolveBackpack: async () => ({ heroId: "h1", capacity: 8, potionCapacity: 2 }),
}));
vi.mock("@/server/api/beta-raid/encounter-where", () => ({ playerCell: async () => s.pos }));
vi.mock("@/server/api/beta-raid/voidGate", () => ({ requireNotVoid: async () => {} }));
vi.mock("@/server/api/beta-raid/mine-place/mine-place-choke", () => ({
  chokeMinesKeySql: () => "'K1'",
  requireNoChoke: async () => {
    if (s.choke) throw new Error(s.choke);
    return "K1";
  },
}));

vi.mock("@/server/api/beta-raid/econ/energy-note", () => ({
  noteEnergySpend: async (_a: string, n: number) => {
    s.notes.push(n);
  },
}));

const { placeDaraiMine } = await import("./dmine-place");
const place = (data: Record<string, unknown> = {}) =>
  (placeDaraiMine as unknown as Fn)({
    data: { stackKey: "dmine:darai", dq: 1, dr: 0, op: "op123456", ...data },
  });
const opRow = (q: number, r: number, sent = false) => ({
  op: "k",
  kind: "place",
  map_id: "rmap_1",
  q,
  r,
  dmine_id: "dm_1",
  paid: 0,
  sent,
});

beforeEach(() => {
  Object.assign(s, {
    row: { was: false, placed: true, cell: true, box: true, dm: true },
    execError: null,
    op: null,
    mapId: "rmap_1",
    pos: { q: 10, r: 5 },
    choke: null,
  });
  s.sql.length = 0;
  s.opQueue.length = 0;
  s.announced.length = 0;
  s.notes.length = 0;
});

describe("placeDaraiMine", () => {
  it("встал на соседнюю клетку героя: гриб с ближайшим выпадением, 5 энергии, разослано", async () => {
    s.opQueue.push(null);
    s.op = opRow(11, 5);
    s.row = { was: false, placed: true, cell: true, box: true, dm: true, paid: 5 };
    await expect(place()).resolves.toEqual({ ok: true, q: 11, r: 5 });
    const sql = s.sql.find((x) => /WITH prior AS/.test(x))!;
    expect(sql).toContain("'dmplace:acc_1:op123456'");
    expect(sql).not.toContain("AND d.id = '");
    expect(sql).toContain("ORDER BY LEAST(d.taken_at");
    expect(sql).toContain("touch_energy_atomic('w1.tg', 5::numeric)");
    expect(sql).toContain("c.map_id = 'rmap_1' AND c.q = 11 AND c.r = 5");
    expect(s.announced).toHaveLength(1);
    expect(s.notes).toEqual([5]);
  });

  it("не хватает энергии — понятный отказ с ценой, ничего не встало", async () => {
    s.execError = "ERROR: not_enough_energy";
    s.opQueue.push(null);
    await expect(place()).rejects.toThrow('mineplace.no_energy|{"need":5}');
    expect(s.announced).toHaveLength(0);
    expect(s.notes).toEqual([]);
  });

  it("другая карта (этаж «Акания») — ставится на ней, у героя; остров — нет", async () => {
    s.mapId = "rmap_6C7t2Vnb";
    s.opQueue.push(null);
    s.op = { ...opRow(10, 5), map_id: "rmap_6C7t2Vnb" };
    await expect(place({ dq: 0, dr: 0 })).resolves.toEqual({ ok: true, q: 10, r: 5 });
    const sql = s.sql.find((x) => /WITH prior AS/.test(x))!;
    expect(sql).toContain("'godmove:rmap_6C7t2Vnb'");
    expect(sql).toContain("c.map_id = 'rmap_6C7t2Vnb' AND c.q = 10 AND c.r = 5");
    expect(s.announced).toHaveLength(1);
  });

  it("дальше соседней клетки, чужая стопка, остров — отказ до базы", async () => {
    await expect(place({ dq: 1, dr: 1 })).rejects.toThrow("pchest.place_far");
    await expect(place({ stackKey: "custom:cst_x" })).rejects.toThrow("dmine.no_item");
    s.mapId = "isle_abc";
    await expect(place()).rejects.toThrow("dmine.island");
    expect(s.sql.some((x) => /WITH prior AS/.test(x))).toBe(false);
  });

  it("перекроет проход — всё равно сажаем (проход не проверяем)", async () => {
    s.choke = "mineplace.blocks_path";
    s.opQueue.push(null);
    s.op = opRow(11, 5);
    await expect(place()).resolves.toEqual({ ok: true, q: 11, r: 5 });
    expect(s.sql.some((x) => /WITH prior AS/.test(x))).toBe(true);
  });

  it("вид — по стопке: золотой гриб сажается из dmine:gold; не гриб — отказ", async () => {
    s.opQueue.push(null);
    s.op = opRow(11, 5);
    await expect(place({ stackKey: "dmine:gold" })).resolves.toEqual({ ok: true, q: 11, r: 5 });
    const sql = s.sql.find((x) => /WITH prior AS/.test(x))!;
    expect(sql).toContain("b.stack_key = 'dmine:gold'");
    expect(sql).toContain("d.mushroom = 'gold'");
    await expect(place({ stackKey: "boss:rbt_1" })).rejects.toThrow("dmine.no_item");
  });

  it("повтор нажатия: прошлый итог без второго оператора; неразосланное — дослать", async () => {
    s.op = opRow(11, 5, false);
    await expect(place()).resolves.toEqual({ ok: true, q: 11, r: 5 });
    expect(s.sql.some((x) => /WITH prior AS/.test(x))).toBe(false);
    expect(s.announced).toHaveLength(1);
  });

  it("отказ оператора — ключом словаря", async () => {
    s.row = { was: false, placed: false, cell: true, box: true, expired: true, dm: false };
    await expect(place()).rejects.toThrow("dmine.expired");
    s.row = { was: false, placed: false, cell: true, box: true, dm: true, road: true };
    await expect(place()).rejects.toThrow("mineplace.road");
  });

  it("обрыв после коммита — судит ключ нажатия", async () => {
    s.execError = "bridge timeout";
    s.opQueue.push(null);
    s.op = opRow(11, 5, true);
    await expect(place()).resolves.toEqual({ ok: true, q: 11, r: 5 });
    s.opQueue.push(null);
    s.op = null;
    await expect(place()).rejects.toThrow("bridge timeout");
  });
});
