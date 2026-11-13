// Демо-остров: вход из профиля запоминает, откуда пришла, выход возвращает туда;
// создаётся картой острова без строки задания (raid_island не трогается).
import { beforeEach, describe, expect, it, vi } from "vitest";

const SPAWN = { q: 5, r: 6 };
type Row = { map_id: string | null; places: unknown; back_map: string | null; back_q: number | null; back_r: number | null };
const s = vi.hoisted(() => ({
  row: null as Row | null,
  here: null as { mapId: string; q: number; r: number } | null,
  maps: new Set<string>(),
  sql: [] as string[],
  moves: [] as Array<{ from: string | null; to: unknown }>,
  dropped: [] as string[],
}));

vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    if (sql.includes("INSERT INTO yuplink.raid_demo_island")) {
      const id = /'(isle_[^']+)'/.exec(sql)?.[1] ?? null;
      if (!s.row?.map_id) s.row = { map_id: id, places: { spawn: SPAWN }, back_map: null, back_q: null, back_r: null };
      return [];
    }
    if (sql.includes("FROM yuplink.raid_demo_island")) return s.row ? [s.row] : [];
    if (sql.includes("FROM yuplink.raid_maps")) {
      const id = /id = '([^']+)'/.exec(sql)?.[1] ?? "";
      return s.maps.has(id) ? [{ ok: 1 }] : [];
    }
    return [];
  },
}));
vi.mock("@/lib/raid/island/steps", () => ({ parsePlaces: (v: unknown) => v }));
vi.mock("./island-move", () => ({
  positionOf: async () => s.here,
  moveAcross: async (_w: string, from: string | null, to: { mapId: string; q: number; r: number }) => {
    s.moves.push({ from, to });
    s.here = { ...to };
    return true;
  },
  mainWorldStart: async () => ({ mapId: "rmap_alpha", q: 34, r: 63 }),
}));
vi.mock("./island-hero", () => ({ ensureIslandHero: async () => {} }));
vi.mock("./island-base", () => ({ islandBase: async () => ({ spec: {}, catalog: {} }) }));
vi.mock("./island-master", () => ({ masterMapId: async () => null, loadMaster: async () => null }));
vi.mock("./town-template-store", () => ({ activeTemplates: async () => [] }));
vi.mock("@/lib/raid/island/master", () => ({ islandFromMaster: () => null }));
vi.mock("@/lib/raid/island/generate", () => ({
  generateIsland: (_b: unknown, _c: unknown, _seed: number, prizes: unknown) => ({
    places: { spawn: SPAWN },
    townName: "Проба",
    prizes,
  }),
}));
vi.mock("./island-write", () => ({ islandMapSql: (o: { mapId: string }) => [`-- карта ${o.mapId}`] }));
vi.mock("./island-create", () => ({ dropIsland: async (id: string) => void s.dropped.push(id) }));

const demo = await import("./demo-island");

beforeEach(() =>
  Object.assign(s, { row: null, here: null, maps: new Set(), sql: [], moves: [], dropped: [] }),
);

const live = (back: string | null = null): Row => ({
  map_id: "isle_demo",
  places: { spawn: SPAWN },
  back_map: back,
  back_q: back ? 20 : null,
  back_r: back ? 32 : null,
});

describe("демо-остров", () => {
  it("вход: запоминает, откуда пришла, и ставит на старт острова", async () => {
    s.row = live();
    s.here = { mapId: "isle_barna", q: 20, r: 32 };
    expect(await demo.enterDemoIsland("designer.near", "acc_kai")).toEqual({ map: "isle_demo", at: SPAWN });
    const back = s.sql.find((q) => q.includes("SET back_map"))!;
    expect(back).toContain("back_map = 'isle_barna'");
    expect(back).toContain("account_id = 'acc_kai'");
    expect(s.moves).toEqual([{ from: "isle_barna", to: { mapId: "isle_demo", ...SPAWN } }]);
  });

  it("уже на демо-острове — вход никуда не двигает", async () => {
    s.row = live();
    s.here = { mapId: "isle_demo", q: 9, r: 9 };
    expect(await demo.enterDemoIsland("designer.near", "acc_kai")).toEqual({ map: "isle_demo", at: { q: 9, r: 9 } });
    expect(s.moves).toEqual([]);
  });

  it("острова нет — создаёт: карта острова и своя строка, без задания и подарка", async () => {
    s.here = { mapId: "isle_barna", q: 20, r: 32 };
    const out = await demo.enterDemoIsland("designer.near", "acc_kai");
    expect(out.map).toMatch(/^isle_/);
    const map = s.sql.findIndex((q) => q.startsWith("-- карта isle_"));
    const row = s.sql.findIndex((q) => q.includes("INSERT INTO yuplink.raid_demo_island"));
    expect(map).toBeGreaterThanOrEqual(0);
    expect(row).toBeGreaterThan(map);
    expect(s.sql.some((q) => q.includes("INSERT INTO yuplink.raid_island "))).toBe(false);
    expect(s.dropped).toEqual([]);
    expect(s.moves.at(-1)?.to).toEqual({ mapId: out.map, ...SPAWN });
  });

  it("строка демо-острова не перезаписывает живую карту", () => {
    const sql = demo.demoRowSql({ account: "acc_kai", mapId: "isle_x", seed: 1, places: { spawn: SPAWN } as never, by: "w" });
    expect(sql).toContain("ON CONFLICT (account_id) DO UPDATE");
    expect(sql).toContain("WHERE yuplink.raid_demo_island.map_id IS NULL");
  });

  it("выход — туда, откуда пришла", async () => {
    s.row = live("isle_barna");
    s.maps.add("isle_barna");
    s.here = { mapId: "isle_demo", q: 5, r: 6 };
    expect(await demo.leaveDemoIsland("designer.near", "acc_kai")).toEqual({ map: "isle_barna", at: { q: 20, r: 32 } });
    expect(s.moves).toEqual([{ from: "isle_demo", to: { mapId: "isle_barna", q: 20, r: 32 } }]);
  });

  it("карты, откуда пришла, больше нет — к замку основного мира", async () => {
    s.row = live("isle_gone");
    s.here = { mapId: "isle_demo", q: 5, r: 6 };
    expect(await demo.leaveDemoIsland("designer.near", "acc_kai")).toEqual({ map: "rmap_alpha", at: { q: 34, r: 63 } });
  });

  it("выход не ведёт в закрытый мир: годится открытый, главная карта или остров", async () => {
    s.row = live("rmap_closed");
    s.here = { mapId: "isle_demo", q: 5, r: 6 };
    await demo.leaveDemoIsland("designer.near", "acc_kai");
    const check = s.sql.find((q) => q.includes("FROM yuplink.raid_maps"))!;
    expect(check).toContain("m.active");
    expect(check).toContain("'isle_'");
    expect(check).toContain("beta_raid_map");
  });

  it("на остров новичка с демо — возврат туда, откуда пришла на демо (не по кругу)", async () => {
    s.row = live("rmap_alpha");
    expect(await demo.backPastDemo("acc_kai", { mapId: "isle_demo", q: 5, r: 6 }, "isle_barna")).toEqual({
      mapId: "rmap_alpha",
      q: 20,
      r: 32,
    });
    s.row = live("isle_barna");
    expect(await demo.backPastDemo("acc_kai", { mapId: "isle_demo", q: 5, r: 6 }, "isle_barna")).toEqual({
      mapId: "rmap_alpha",
      q: 34,
      r: 63,
    });
    const elsewhere = { mapId: "rmap_beta", q: 1, r: 2 };
    expect(await demo.backPastDemo("acc_kai", elsewhere, "isle_barna")).toEqual(elsewhere);
  });

  it("не на демо-острове — выход ничего не делает", async () => {
    s.row = live("isle_barna");
    s.here = { mapId: "isle_barna", q: 20, r: 32 };
    expect(await demo.leaveDemoIsland("designer.near", "acc_kai")).toBeNull();
    expect(await demo.onDemoIsland("acc_kai")).toBe(false);
    expect(s.moves).toEqual([]);
  });
});
