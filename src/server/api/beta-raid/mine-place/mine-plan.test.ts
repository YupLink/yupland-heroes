// Режим стройки и чертёж (§8.59 п. 8) поверх фейковой базы: круг вокруг героя,
// «✓» кладёт чертёж только на зелёную клетку (заново проверив), «Разместить» —
// по чертежу рядом с героем и за энергию; нехватка — понятный отказ с ценой,
// повтор нажатия после постановки — тот же ответ без второй платы.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MineCandidates } from "./mine-plan";

type Fn = (a?: { data?: unknown }) => Promise<unknown>;
const s = vi.hoisted(() => ({
  sql: [] as string[],
  mapId: "rmap_1",
  pos: { q: 10, r: 5 },
  plan: null as Record<string, unknown> | null,
  cand: [] as Array<Record<string, unknown>>,
  row: null as Record<string, unknown> | null,
  execError: null as string | null,
  opRow: null as Record<string, unknown> | null,
  notes: [] as Array<[string, number, string]>,
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const wrap = (fn: Fn, v?: (d: unknown) => unknown) => async (a?: { data?: unknown }) =>
      fn({ data: v ? v(a?.data) : a?.data });
    return {
      handler: (fn: Fn) => wrap(fn),
      inputValidator: (v: (d: unknown) => unknown) => ({ handler: (fn: Fn) => wrap(fn, v) }),
    };
  },
}));
vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    if (/kind, stack_key FROM yuplink\.raid_mine_plan/.test(sql)) return s.plan ? [s.plan] : [];
    if (/AS held\s+FROM yuplink\.raid_mine_plan pl/.test(sql)) return s.plan ? [s.plan] : [];
    if (/CROSS JOIN LATERAL \(SELECT f\.decor, f\.ship\) ex/.test(sql)) return s.cand;
    if (/UNION ALL SELECT NULL, NULL/.test(sql)) return [{ q: null, r: null, k: "K1" }];
    if (/WHERE o\.op = /.test(sql)) return s.opRow ? [s.opRow] : [];
    if (/WITH prior AS/.test(sql)) {
      if (s.execError) throw new Error(s.execError);
      return s.row ? [{ _row: s.row }] : [];
    }
    if (/mystic_item_template\s+WHERE id =/.test(sql))
      return [{ id: "building_yYIdx793rM", name: "Лесопилка", meta: { effect: "mine" } }];
    return [];
  },
}));
vi.mock("@/server/raidLive", () => ({ publishRaid: () => {} }));
vi.mock("@/server/api/beta-raid/plain-chest/pchest-row", () => ({
  pchestActor: async () => ({ wallet: "w1.tg", mapId: s.mapId, account: "acc_1" }),
}));
vi.mock("@/server/api/beta-raid/item-alias", () => ({
  canonRef: async (_k: string, ref: string | null) => ref,
  refFromStackKey: (k: string) => k.slice(k.indexOf(":") + 1) || null,
}));
vi.mock("@/server/api/beta-raid/market-backpack", () => ({
  resolveBackpack: async () => ({ heroId: "h1", capacity: 8, potionCapacity: 2 }),
}));
vi.mock("@/server/api/beta-raid/encounter-where", () => ({ playerCell: async () => s.pos }));
vi.mock("@/server/api/beta-raid/voidGate", () => ({ requireNotVoid: async () => {} }));
vi.mock("@/server/api/beta-raid/voidCells", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  withoutVoid: async (_m: string, cells: string[]) => cells,
}));
vi.mock("@/server/api/beta-raid/map-journal", () => ({ recordMapChange: async () => 1 }));
vi.mock("@/server/api/beta-raid/econ/energy-note", () => ({
  noteEnergySpend: async (a: string, n: number, why: string) => void s.notes.push([a, n, why]),
}));

const plan = await import("./mine-plan");
const { placeMineBlueprint } = await import("./mine-place");
const call = (fn: unknown, data?: unknown) => (fn as Fn)({ data });
const WOOD = "custom:cst_mine_bp_wood";
const okCell = { busy: false, road: false, taken: false, bag: false, player: false, trees: 4 };

beforeEach(() => {
  Object.assign(s, {
    mapId: "rmap_1",
    pos: { q: 10, r: 5 },
    plan: null,
    cand: [
      { q: 11, r: 5, ...okCell },
      { q: 10, r: 6, ...okCell, road: true },
    ],
    row: { was: false, placed: true, cell: true, box: true, paid: 1 },
    execError: null,
    opRow: null,
  });
  s.sql.length = 0;
  s.notes.length = 0;
});

describe("круг и чертёж", () => {
  it("круг — 19 клеток вокруг героя; зелёная только с хорошей строкой", async () => {
    const res = (await call(plan.minePlaceCandidates, { stackKey: WOOD })) as MineCandidates;
    expect(res.center).toEqual({ q: 10, r: 5 });
    expect(res.cells).toHaveLength(19);
    expect(res.cells.filter((c) => c.ok)).toEqual([{ q: 11, r: 5, ok: true, reason: null }]);
  });

  it("остров и не заготовка — отказ до базы", async () => {
    s.mapId = "isle_x";
    await expect(call(plan.minePlaceCandidates, { stackKey: WOOD })).rejects.toThrow(
      "mineplace.island",
    );
    s.mapId = "rmap_1";
    await expect(
      call(plan.createMinePlan, { stackKey: "custom:cst_apple", q: 11, r: 5 }),
    ).rejects.toThrow("mineplace.not_blueprint");
    expect(s.sql.some((x) => x.includes("raid_mine_plan"))).toBe(false);
  });

  it("«✓»: зелёная — чертёж (замена прежнего); красная и далёкая — отказ", async () => {
    await expect(call(plan.createMinePlan, { stackKey: WOOD, q: 11, r: 5 })).resolves.toEqual({
      mapId: "rmap_1",
      q: 11,
      r: 5,
      kind: "wood",
      stackKey: WOOD,
      energy: 10,
    });
    const put = s.sql.find((x) => x.includes("INSERT INTO yuplink.raid_mine_plan")) ?? "";
    expect(put).toContain("VALUES ('acc_1', 'rmap_1', 11, 5,");
    expect(put).toContain("ON CONFLICT (account_id) DO UPDATE");
    s.sql.length = 0;
    await expect(call(plan.createMinePlan, { stackKey: WOOD, q: 10, r: 6 })).rejects.toThrow(
      "mineplace.road",
    );
    await expect(call(plan.createMinePlan, { stackKey: WOOD, q: 13, r: 5 })).rejects.toThrow(
      "mineplace.plan_far",
    );
    expect(s.sql.some((x) => x.includes("INSERT INTO yuplink.raid_mine_plan"))).toBe(false);
  });

  it("мой чертёж — только на этой карте; «Убрать» стирает свой", async () => {
    s.plan = {
      map_id: "rmap_1",
      q: 11,
      r: 5,
      kind: "diamonds",
      stack_key: "custom:cst_mine_bp_diamonds",
    };
    await expect(call(plan.getMyMinePlan)).resolves.toMatchObject({
      mapId: "rmap_1",
      q: 11,
      r: 5,
      energy: 20,
    });
    s.plan = { ...s.plan, map_id: "floor_2" };
    await expect(call(plan.getMyMinePlan)).resolves.toBeNull();
    await call(plan.removeMinePlan);
    expect(s.sql.at(-1)).toContain("DELETE FROM yuplink.raid_mine_plan WHERE account_id = 'acc_1'");
  });

  it("клетку чертежа заняли насовсем — чертёж стирается (именно он), ответ «нет»", async () => {
    s.plan = { map_id: "rmap_1", q: 11, r: 5, kind: "wood", stack_key: WOOD, held: true };
    await expect(call(plan.getMyMinePlan)).resolves.toBeNull();
    const look = s.sql.find((x) => x.includes("AS held")) ?? "";
    expect(look.replace(/\s+/g, " ")).toContain(
      "(f.building OR f.obj OR f.water OR f.dome OR f.chest OR f.guard OR ex.decor OR ex.ship) " +
        "OR f.road OR f.taken OR f.bag",
    );
    expect(look).not.toMatch(/f\.player/); // игрок на клетке чертёж не губит
    expect(s.sql.at(-1)?.replace(/\s+/g, " ")).toContain(
      "DELETE FROM yuplink.raid_mine_plan WHERE account_id = 'acc_1' AND map_id = 'rmap_1' " +
        "AND q = 11 AND r = 5;",
    );
  });
});

describe("«Разместить» по чертежу", () => {
  const place = () => call(placeMineBlueprint, { op: "op123456" });
  beforeEach(() => {
    s.plan = { map_id: "rmap_1", q: 11, r: 5, kind: "wood", stack_key: WOOD };
  });

  it("рядом с героем — шахта за энергию вида, плата в журнал «build»", async () => {
    await expect(place()).resolves.toEqual({ ok: true, q: 11, r: 5, kind: "wood" });
    const sql = s.sql.find((x) => x.includes("WITH prior AS")) ?? "";
    expect(sql).toContain("touch_energy_atomic('w1.tg', 10::numeric)");
    expect(sql).toContain("DELETE FROM yuplink.raid_mine_plan pl USING setc");
    expect(s.notes).toEqual([["acc_1", 10, "build"]]);
  });

  it("чертежа нет — «сначала чертёж»; далеко — «подойди»", async () => {
    s.plan = null;
    await expect(place()).rejects.toThrow("mineplace.no_plan");
    s.plan = { map_id: "rmap_1", q: 12, r: 5, kind: "wood", stack_key: WOOD };
    await expect(place()).rejects.toThrow("mineplace.far");
    expect(s.sql.some((x) => x.includes("WITH prior AS"))).toBe(false);
  });

  it("нет энергии — отказ с ценой, ничего не стоит и не платится", async () => {
    s.execError = "ERROR: not_enough_energy (P0001)";
    await expect(place()).rejects.toThrow('mineplace.no_energy|{"need":10}');
    expect(s.notes).toHaveLength(0);
  });

  it("повтор нажатия после постановки (чертёж уже стёрт) — тот же ответ, без второй платы", async () => {
    s.plan = null;
    s.opRow = {
      op: "k",
      map_id: "rmap_1",
      q: 11,
      r: 5,
      kind: "wood",
      sent: true,
      building_id: "building_yYIdx793rM",
    };
    await expect(place()).resolves.toEqual({ ok: true, q: 11, r: 5, kind: "wood" });
    expect(s.sql.some((x) => x.includes("WITH prior AS"))).toBe(false);
    expect(s.notes).toHaveLength(0);
  });
});
