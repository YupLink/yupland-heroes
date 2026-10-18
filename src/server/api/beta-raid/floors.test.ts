// Этажи (§8.39): новый — следующим номером и сразу открыт, одним оператором;
// награды открытого этажа закладываются из пула, заложенное раньше не
// двигается; главный мир и этаж с игроками не снимаются.
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({
  sql: [] as string[],
  created: true,
  dropped: true,
  players: 0,
  settled: [] as unknown[],
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const fn = { inputValidator: () => fn, handler: (h: unknown) => h };
    return fn;
  },
}));
vi.mock("../../auth", () => ({ requireAdmin: () => "admin.near" }));
vi.mock("./encounter-where", () => ({
  activeBetaMapId: async () => "alpha",
  myMapId: async () => "alpha",
}));
vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    if (sql.includes("INSERT INTO yuplink.raid_floor")) return s.created ? [{ id: "maze" }] : [];
    if (sql.includes("DELETE FROM yuplink.raid_floor")) return s.dropped ? [{ id: "maze" }] : [];
    if (sql.includes("count(*)::int AS n")) return [{ n: s.players }];
    return [];
  },
}));
vi.mock("./map-darai-hold", () => ({
  readDaraiHold: async (mapId: string) => ({
    mapId,
    cells: null,
    rows: new Map([["1,1", { q: 1, r: 1, darai: 500, ref: null, held: 0, state: "alive" }]]),
  }),
  settleDaraiHold: async (before: unknown) => void s.settled.push(before),
}));

const floors = await import("./floors");
type Fn = (a: { data: Record<string, string> }) => Promise<unknown>;
const create = floors.adminCreateFloor as unknown as Fn;
const drop = floors.adminDropFloor as unknown as Fn;

beforeEach(() => {
  Object.assign(s, { sql: [], created: true, dropped: true, players: 0, settled: [] });
});

describe("новый этаж", () => {
  it("номер следующий, карта открывается тем же оператором, награды закладываются", async () => {
    await create({ data: { here: "alpha", mapId: "maze", name: "Мир лабиринта" } });
    const sql = s.sql.find((x) => x.includes("INSERT INTO yuplink.raid_floor")) ?? "";
    expect(sql).toContain("max(num) FROM yuplink.raid_floor), 0) + 1");
    expect(sql).toContain("SET active = true");
    expect(sql).toContain("'Мир лабиринта'");
    // «До» — те же объекты без номинала: закладывается только недостающее.
    const before = s.settled[0] as { mapId: string; rows: Map<string, { darai: number }> };
    expect(before.mapId).toBe("maze");
    expect(before.rows.get("1,1")?.darai).toBe(0);
  });

  it("карта уже этаж — отказ, пул не трогаем", async () => {
    s.created = false;
    await expect(
      create({ data: { here: "alpha", mapId: "maze", name: "Ещё раз" } }),
    ).rejects.toThrow("уже этаж");
    expect(s.settled).toHaveLength(0);
  });
});

describe("снять этаж", () => {
  it("главный мир — нельзя", async () => {
    await expect(drop({ data: { here: "alpha", mapId: "alpha" } })).rejects.toThrow("Главный мир");
  });

  it("закрывает карту, если на этаже никого", async () => {
    await drop({ data: { here: "alpha", mapId: "maze" } });
    const sql = s.sql.find((x) => x.includes("DELETE FROM yuplink.raid_floor")) ?? "";
    expect(sql).toContain("NOT EXISTS (SELECT 1 FROM yuplink.beta_raid_positions");
    expect(sql).toContain("SET active = false");
  });

  it("на этаже игроки — отказ с числом", async () => {
    Object.assign(s, { dropped: false, players: 3 });
    await expect(drop({ data: { here: "alpha", mapId: "maze" } })).rejects.toThrow(
      "На этаже стоят игроки: 3",
    );
  });
});
