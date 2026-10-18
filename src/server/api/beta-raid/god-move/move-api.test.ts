// Ручка переноса: только админ; отказы — без записи и без рассылки; перенос
// (и его повтор) — рассылка по виду: здание — карта «перестроена», built и
// restored; декор — дельта клеток и мешочки; объект — правда слоя объектов;
// сундук — built и мешочки; мешочки — bags по клетке.
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({
  admin: true,
  sql: [] as string[],
  unit: [] as Array<Record<string, unknown>>,
  row: null as Record<string, unknown> | null,
  events: [] as unknown[],
  rebuilt: 0,
  patches: [] as unknown[],
  journal: [] as unknown[],
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const fn = { inputValidator: () => fn, handler: (h: unknown) => h };
    return fn;
  },
}));
vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string, o?: { wrapJson?: boolean }) => {
    s.sql.push(sql);
    if (o?.wrapJson) return s.unit;
    return s.row ? [{ _row: s.row }] : [];
  },
}));
vi.mock("@/server/auth", () => ({
  requireAdmin: () => {
    if (!s.admin) throw new Error("Доступ запрещён: требуется admin-кошелёк");
    return "admin.near";
  },
}));
vi.mock("@/server/raidLive", () => ({ publishRaid: (e: unknown) => s.events.push(e) }));
vi.mock("@/server/api/beta-raid/encounter-where", () => ({
  activeBetaMapId: async () => "rmap_x",
  myMapId: async () => "rmap_x",
}));
vi.mock("@/server/api/beta-raid/voidCells", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  withoutVoid: async (_m: string, cells: string[]) => cells,
}));
vi.mock("@/server/api/beta-raid/town-resolve", () => ({ ensureTownSchema: async () => {} }));
vi.mock("@/server/api/beta-raid/map-change-hooks", () => ({
  noteMapRebuilt: async () => {
    s.rebuilt++;
  },
  noteAdminPatches: async (_m: string, p: unknown[]) => {
    s.patches.push(...p);
  },
  cellTruthPatches: async (_m: string, keys: string[]) => keys.map((k) => ({ k })),
}));
vi.mock("@/server/api/beta-raid/map-journal", () => ({
  recordMapChange: async (_m: string, c: unknown, _a: unknown, o: unknown) => {
    s.journal.push({ c, o });
  },
}));
vi.mock("@/server/api/beta-raid/flee-cells", () => ({ dropFleeCache: () => {} }));
vi.mock("@/server/api/beta-raid/zonegen/affinity", () => ({ dropAffinityCache: () => {} }));

type In = {
  kind: string;
  from: { q: number; r: number };
  to: { q: number; r: number };
  ref: string;
  mapId?: string;
};
const { adminGodMove } = await import("@/server/api/beta-raid/god-move/move-api");
const move = adminGodMove as unknown as (a: { data: In }) => Promise<unknown>;
const data: In = {
  kind: "building",
  from: { q: 4, r: -2 },
  to: { q: 7, r: 1 },
  ref: "bld_1",
  mapId: "rmap_x",
};
const lead = { q: 4, r: -2, group_id: null, building: true, decor: false };
const cell = (q: number, r: number, b: string | null, d: string | null = null) => ({
  q,
  r,
  b,
  s: null,
  d,
  g: null,
  k: null,
});

beforeEach(() =>
  Object.assign(s, {
    admin: true,
    sql: [],
    unit: [lead],
    row: null,
    events: [],
    rebuilt: 0,
    patches: [],
    journal: [],
  }),
);

describe("ручка переноса", () => {
  it("не админ — отказ до базы", async () => {
    s.admin = false;
    await expect(move({ data })).rejects.toThrow(/admin/);
    expect(s.sql).toHaveLength(0);
  });

  it("чужая карта и та же клетка — отказ без запроса и без рассылки", async () => {
    expect(await move({ data: { ...data, mapId: "rmap_old" } })).toEqual({
      ok: false,
      reason: "other_map",
      leftovers: [],
    });
    expect(await move({ data: { ...data, to: { q: 4, r: -2 } } })).toMatchObject({
      reason: "same_cell",
    });
    expect(s.sql).toHaveLength(0);
    expect(s.events).toHaveLength(0);
  });

  it("здание: снимок единицы, один перенос, карта «перестроена», built обеих клеток и restored", async () => {
    s.row = { reason: "ok", moved: [cell(7, 1, "bld_1"), cell(4, -2, null)], tier: 2, cells: 2 };
    expect(await move({ data })).toMatchObject({ ok: true, already: false });
    expect(s.sql).toHaveLength(2);
    expect(s.sql[1]).toContain("pg_advisory_xact_lock(hashtext('godmove:rmap_x'))");
    expect(s.rebuilt).toBe(1);
    expect(s.events).toEqual([
      { mapId: "rmap_x", type: "built", cells: ["4,-2", "7,1"] },
      { mapId: "rmap_x", type: "restored" },
    ]);
  });

  it("клетки нет — «уже нет» без переноса; в блоке два здания — отказ до переноса", async () => {
    s.unit = [];
    expect(await move({ data })).toMatchObject({ ok: false, reason: "gone" });
    s.unit = [
      { q: 4, r: -2, group_id: "g_1", building: true, decor: false },
      { q: 5, r: -2, group_id: "g_1", building: true, decor: false },
    ];
    expect(await move({ data })).toMatchObject({ ok: false, reason: "block_many" });
    expect(s.sql).toHaveLength(2);
    expect(s.events).toHaveLength(0);
  });

  it("декор: точная дельта клеток, мешочки по каждой клетке, без пересборки", async () => {
    s.unit = [{ q: 4, r: -2, group_id: null, building: false, decor: true }];
    s.row = { reason: "ok", moved: [cell(7, 1, null, "dec_oak"), cell(4, -2, null)] };
    await move({ data: { ...data, kind: "decor", ref: "dec_oak" } });
    expect(s.rebuilt).toBe(0);
    expect(s.patches).toEqual([
      { q: 7, r: 1, decorationId: "dec_oak" },
      { q: 4, r: -2, decorationId: null },
    ]);
    expect(s.events).toEqual([
      { mapId: "rmap_x", type: "bags", cells: ["4,-2"] },
      { mapId: "rmap_x", type: "bags", cells: ["7,1"] },
      { mapId: "rmap_x", type: "restored" },
    ]);
  });

  it("объект: правда обеих клеток с подъёмом версии правок; мешочки прежней клетки", async () => {
    s.row = { reason: "ok", object_id: "boss:rbt_1", bags_from: true };
    expect(await move({ data: { ...data, kind: "object", ref: "boss:rbt_1" } })).toMatchObject({
      ok: true,
      moved: { object: { id: "boss:rbt_1", alive: true } },
    });
    expect(s.sql).toHaveLength(1);
    expect(s.journal).toEqual([
      { c: { patches: [{ k: "4,-2" }, { k: "7,1" }] }, o: { edit: true } },
    ]);
    expect(s.events).toEqual([
      { mapId: "rmap_x", type: "bags", cells: ["4,-2"] },
      { mapId: "rmap_x", type: "restored" },
    ]);
  });

  it("сундук: ref «magic:/plain:»; built и мешочки по клеткам; кривой ref — «changed»", async () => {
    s.row = { reason: "ok", chest: 1, pass: 0 };
    await move({ data: { ...data, kind: "chest", ref: "plain:pc_abc" } });
    expect(s.sql[0]).toContain("hashtext('pchest:pc_abc')");
    expect(s.events).toEqual([
      { mapId: "rmap_x", type: "built", cells: ["4,-2", "7,1"] },
      { mapId: "rmap_x", type: "bags", cells: ["4,-2"] },
      { mapId: "rmap_x", type: "bags", cells: ["7,1"] },
    ]);
    expect(await move({ data: { ...data, kind: "chest", ref: "pc_abc" } })).toMatchObject({
      reason: "changed",
    });
  });

  it("мешочки: id через запятую; bags по каждой клетке", async () => {
    s.row = { reason: "ok", bags: 2, pass: 0 };
    await move({ data: { ...data, kind: "bags", ref: "lb_a,lb_b" } });
    expect(s.sql[0]).toContain("b.id IN ('lb_a', 'lb_b')");
    expect(s.events).toEqual([
      { mapId: "rmap_x", type: "bags", cells: ["4,-2"] },
      { mapId: "rmap_x", type: "bags", cells: ["7,1"] },
    ]);
  });

  it("отказ базы — причина с остатками, ни рассылки, ни пересборки", async () => {
    s.row = { reason: "target_leftovers", warehouse: true };
    expect(await move({ data })).toEqual({
      ok: false,
      reason: "target_leftovers",
      leftovers: ["warehouse"],
    });
    expect(s.events).toHaveLength(0);
    expect(s.rebuilt).toBe(0);
  });

  it("повтор — «уже там», рассылка та же; база не ответила строкой — ошибка", async () => {
    s.row = { reason: "already", moved: null };
    expect(await move({ data })).toMatchObject({ ok: true, already: true });
    expect(s.rebuilt).toBe(1);
    s.row = null;
    await expect(move({ data })).rejects.toThrow("godmove.failed");
  });
});
