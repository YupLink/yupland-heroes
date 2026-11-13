// Ручка «Посадить дерево» поверх фейковой базы: клетка — герой + dq/dr, только
// своя или соседняя, не на острове, 15 энергии тем же оператором, ключ нажатия,
// повтор не сажает второе, отказ — ключом словаря, дерево разослано всем.
import { beforeEach, describe, expect, it, vi } from "vitest";

type Fn = (a: { data: unknown }) => Promise<unknown>;
const s = vi.hoisted(() => ({
  sql: [] as string[],
  row: null as Record<string, unknown> | null,
  execError: null as string | null,
  /** Ответы чтения ключа нажатия по очереди; кончились — op. */
  opQueue: [] as Array<{ q: number; r: number } | null>,
  op: null as { q: number; r: number } | null,
  mapId: "rmap_1",
  pos: { q: 10, r: 5 },
  sweeps: 0,
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
    if (/FROM yuplink.raid_tree_plant_op WHERE op =/.test(sql)) {
      const prev = s.opQueue.length > 0 ? s.opQueue.shift() : s.op;
      return prev ? [prev] : [];
    }
    return [];
  },
}));
vi.mock("@/server/api/beta-raid/decor-respawn", () => ({
  sweepDecorRespawns: async () => {
    s.sweeps += 1;
    return 1;
  },
  startDecorRespawner: () => {},
}));
vi.mock("@/server/api/beta-raid/plain-chest/pchest-row", () => ({
  pchestActor: async () => ({ wallet: "w1.tg", mapId: s.mapId, account: "acc_1" }),
}));
vi.mock("@/server/api/beta-raid/market-backpack", () => ({
  resolveBackpack: async () => ({ heroId: "h1", capacity: 8, potionCapacity: 2 }),
}));
vi.mock("@/server/api/beta-raid/encounter-where", () => ({ playerCell: async () => s.pos }));
vi.mock("@/server/api/beta-raid/voidGate", () => ({ requireNotVoid: async () => {} }));
vi.mock("@/server/api/beta-raid/econ/energy-note", () => ({
  noteEnergySpend: async (_a: string, n: number) => {
    s.notes.push(n);
  },
}));

const { plantTree } = await import("./tree-plant");
const plant = (data: Record<string, unknown> = {}) =>
  (plantTree as unknown as Fn)({
    data: { stackKey: "tree:decoration_oak", dq: 1, dr: 0, op: "op123456", ...data },
  });
const operator = () => s.sql.filter((x) => /WITH prior AS/.test(x));

beforeEach(() => {
  Object.assign(s, {
    row: { was: false, placed: true, cell: true, kind: true, box: true, flags: {}, paid: 15 },
    execError: null,
    op: null,
    mapId: "rmap_1",
    pos: { q: 10, r: 5 },
    sweeps: 0,
  });
  s.sql.length = 0;
  s.opQueue.length = 0;
  s.notes.length = 0;
});

describe("plantTree", () => {
  it("посажено на соседнюю клетку героя: 15 энергии тем же оператором, разослано", async () => {
    await expect(plant()).resolves.toEqual({ ok: true, q: 11, r: 5 });
    const sql = operator()[0];
    expect(sql).toContain("'tplant:acc_1:op123456'");
    expect(sql).toContain("touch_energy_atomic('w1.tg', 15::numeric)");
    expect(sql).toContain("c.map_id = 'rmap_1' AND c.q = 11 AND c.r = 5");
    expect(sql).toContain("b.stack_key = 'tree:decoration_oak'");
    expect(s.sweeps).toBe(1);
    expect(s.notes).toEqual([15]);
  });

  it("под себя — можно (как шахты и грибы)", async () => {
    await expect(plant({ dq: 0, dr: 0 })).resolves.toEqual({ ok: true, q: 10, r: 5 });
  });

  it("не хватает энергии — отказ с ценой, ничего не встало и не разослано", async () => {
    s.execError = "ERROR: not_enough_energy";
    await expect(plant()).rejects.toThrow('mineplace.no_energy|{"need":15}');
    expect(s.sweeps).toBe(0);
    expect(s.notes).toEqual([]);
  });

  it("дальше соседней клетки, не дерево, остров — отказ до базы", async () => {
    await expect(plant({ dq: 1, dr: 1 })).rejects.toThrow("pchest.place_far");
    await expect(plant({ stackKey: "custom:cst_x" })).rejects.toThrow("tree.no_item");
    s.mapId = "isle_abc";
    await expect(plant()).rejects.toThrow("tree.island");
    expect(operator()).toHaveLength(0);
  });

  it("повтор нажатия: прошлый итог без второго оператора и без второй траты", async () => {
    s.op = { q: 11, r: 5 };
    await expect(plant()).resolves.toEqual({ ok: true, q: 11, r: 5 });
    expect(operator()).toHaveLength(0);
    expect(s.notes).toEqual([]);
    // Недосланное прошлым нажатием — дослать.
    expect(s.sweeps).toBe(1);
  });

  it("отказ оператора — ключом словаря; энергия не списана", async () => {
    s.row = { was: false, placed: false, cell: true, kind: true, box: true, flags: { road: true } };
    await expect(plant()).rejects.toThrow("tree.road");
    s.row = {
      was: false,
      placed: false,
      cell: true,
      kind: true,
      box: true,
      flags: { decor: true },
    };
    await expect(plant()).rejects.toThrow("tree.busy");
    s.row = { was: false, placed: false, cell: true, kind: true, box: false, flags: {} };
    await expect(plant()).rejects.toThrow("tree.no_item");
    expect(s.notes).toEqual([]);
    expect(s.sweeps).toBe(0);
  });

  it("обрыв после коммита — судит ключ нажатия", async () => {
    s.execError = "bridge timeout";
    s.opQueue.push(null);
    s.op = { q: 11, r: 5 };
    await expect(plant()).resolves.toEqual({ ok: true, q: 11, r: 5 });
    s.opQueue.push(null);
    s.op = null;
    await expect(plant()).rejects.toThrow("bridge timeout");
  });
});

describe("камень из рюкзака (rock:, 25.10.2026)", () => {
  it("тот же путь: шаблон под кирку, стопка rock:<шаблон>, 15 энергии", async () => {
    await expect(plant({ stackKey: "rock:decoration_stone" })).resolves.toEqual({
      ok: true,
      q: 11,
      r: 5,
    });
    const sql = operator()[0];
    expect(sql).toContain("b.stack_key = 'rock:decoration_stone'");
    expect(sql).toContain("ci.name ~* '(кирк|pick)'");
    expect(s.notes).toEqual([15]);
  });

  it("мусорный ключ камня — tree.no_item, в базу не ходим", async () => {
    await expect(plant({ stackKey: "rock:cst_x" })).rejects.toThrow("tree.no_item");
    expect(operator()).toHaveLength(0);
  });
});
