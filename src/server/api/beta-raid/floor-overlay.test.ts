// «Накладка миров» (жалоба 07.10.2026): на новом этаже стояли лагеря игроков
// главного мира и его замок. Причина — позиции без карты читались как «на
// любой карте». Теперь пустая карта — главный мир: соседи по этажу, «у замка»
// и шапка карты (главный ли мир) считаются по одному правилу.
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({ sql: [] as string[], main: "alpha", rows: [] as unknown[] }));

vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    return s.rows;
  },
}));
vi.mock("./encounter-where", () => ({ activeBetaMapId: async () => s.main }));
vi.mock("./castle", () => ({
  castleCell: async () => ({ q: 32, r: 64 }),
  cellAtCastle: (p: { q: number; r: number } | null, c: { q: number; r: number }) =>
    !!p && p.q === c.q && p.r === c.r,
}));
vi.mock("./hero-energy-sync", () => ({ syncHeroEnergy: async () => {} }));

const { MAIN_MAP_SQL, POS_MAP_SQL } = await import("./pos-map-sql");
const { sharedPlayers } = await import("./players-cache");
const { heroMapState } = await import("./move-hero-state");
const { mapRow } = await import("./map-serve");

beforeEach(() => {
  s.sql = [];
  s.rows = [];
});

describe("позиция без карты — главный мир", () => {
  it("правило одно: пустая карта подменяется главным миром из настроек", () => {
    expect(POS_MAP_SQL("p")).toBe(`COALESCE(p.map_id, ${MAIN_MAP_SQL})`);
    expect(MAIN_MAP_SQL).toContain("key = 'beta_raid_map'");
  });

  it("соседи этажа — только с этой карты, «пустые» не просачиваются", async () => {
    await sharedPlayers("maze");
    const q = s.sql.find((x) => x.includes("beta_raid_positions")) ?? "";
    expect(q).toContain(`${POS_MAP_SQL("p")} = 'maze'`);
    expect(q).not.toContain("p.map_id IS NULL");
  });
});

describe("замок только в главном мире", () => {
  const view = {
    info: { field: { stepDiscountPct: 0 }, squad: [] },
    unknownRace: false,
  } as unknown as Parameters<typeof heroMapState>[2];

  it("у центра главного мира — у замка", async () => {
    const r = await heroMapState("me.near", { q: 32, r: 64 }, view, "alpha");
    expect(r.hero?.atCastle).toBe(true);
  });

  it("в тех же координатах на другом этаже — нет", async () => {
    const r = await heroMapState("me.near", { q: 32, r: 64 }, view, "maze");
    expect(r.hero?.atCastle).toBe(false);
  });

  it("шапка карты говорит клиенту, главный ли это мир", async () => {
    s.rows = [{ id: "maze", name: "Акания", size: 128, main: false }];
    expect(await mapRow("maze")).toEqual({ id: "maze", name: "Акания", size: 128, main: false });
    expect(s.sql[0]).toContain(`rm.id = ${MAIN_MAP_SQL}`);
  });
});
