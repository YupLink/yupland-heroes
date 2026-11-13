// «Управление шахтами»: список своих шахт v2 со всех карт — строки «Добычи»
// (ownedMineRows) по каждой карте, где у аккаунта есть шахта, с клеткой,
// названием карты и уровнем; грибы и шахты старого образца — мимо; окно —
// только с построенным зданием.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MineRow } from "@/server/api/beta-raid/mine-pendings";

const s = vi.hoisted(() => ({
  built: true,
  cells: [] as Array<Record<string, unknown>>,
  rows: {} as Record<string, MineRow[]>,
  asked: [] as string[],
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const fn = { inputValidator: () => fn, handler: (h: unknown) => h };
    return fn;
  },
}));
vi.mock("@/server/api/beta-raid/castle", () => ({ requireAtCastle: async () => {} }));
vi.mock("@/server/api/beta-raid/gate", () => ({ requireBetaRaid: async () => "w_me" }));
vi.mock("@/server/api/currency/move", () => ({ accAccountId: async () => "acc_me" }));
vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    if (/FROM yuplink.castle_building/.test(sql)) return [{ owned: s.built }];
    if (/raid_mine_level/.test(sql)) return s.cells;
    return [];
  },
}));
vi.mock("@/server/api/beta-raid/mine-pendings", () => ({
  ownedMineRows: async (mapId: string) => {
    s.asked.push(mapId);
    return s.rows[mapId] ?? [];
  },
}));

const { officeMine, officeMines, getMineOfficeMines } = await import("./mine-office-list");

const life = { mode: "mid" as const, lifeLeft: 0.5, lifeAt: "2026-10-25T00:00:00.000Z", breakAt: 1, broken: false };
const row = (o: Partial<MineRow>): MineRow => ({
  mapId: "map_a",
  q: 0,
  r: 0,
  resource: "wood",
  token: null,
  yield: 20,
  claimedHours: 0,
  capturedAt: 0,
  maxHours: 10,
  stepHours: 1,
  v2: life,
  ...o,
});
const cell = (map: string, q: number, r: number, extra: Record<string, unknown> = {}) => ({
  map_id: map,
  q,
  r,
  place: map === "map_a" ? "Мир Альфа" : "Акания",
  level: 1,
  ...extra,
});

beforeEach(() => {
  Object.assign(s, { built: true, cells: [], rows: {}, asked: [] });
});

describe("строка окна", () => {
  it("вид, уровень, режим и цена починки — как в окне шахты", () => {
    const m = officeMine(row({ resource: "gold" }), cell("map_a", 0, 0, { level: 3 }));
    expect(m?.kind).toBe("gold");
    expect(m?.level).toBe(3);
    expect(m?.place).toBe("Мир Альфа");
    expect(m?.view).toMatchObject({ mode: "mid", mult: 2, level: 3, island: false, repairCost: { diamonds: 1 } });
  });
  it("остров — цена острова только на карте острова", () => {
    const isle = officeMine(row({ mapId: "isle_x", resource: "diamonds", island: true }), cell("isle_x", 0, 0));
    expect(isle?.view.repairCost).toEqual({ wood: 100, stone: 100 });
    expect(isle?.view.island).toBe(true);
    const world = officeMine(row({ resource: "diamonds", island: true }), cell("map_a", 0, 0));
    expect(world?.view.repairCost).toEqual({ wood: 10_000, stone: 1_000 });
  });
  it("гриб, шахта старого образца и клетка не из списка — мимо", () => {
    const mush = row({ mushroom: { kind: "gold", image: null, diesAt: null } });
    expect(officeMine(mush, cell("map_a", 0, 0))).toBeNull();
    expect(officeMine(row({ v2: null }), cell("map_a", 0, 0))).toBeNull();
    expect(officeMine(row({ resource: "darai" as MineRow["resource"] }), cell("map_a", 0, 0))).toBeNull();
    expect(officeMine(row({}), undefined)).toBeNull();
  });
});

describe("все карты", () => {
  it("каждая карта со шахтами — один раз; порядок: карта, вид, клетка", async () => {
    s.cells = [cell("map_a", 2, 0), cell("map_a", 1, 0), cell("map_b", 0, 0), cell("map_a", 5, 5)];
    s.rows = {
      map_a: [
        row({ q: 2, r: 0, resource: "stone" }),
        row({ q: 1, r: 0 }),
        row({ q: 5, r: 5, mushroom: { kind: "gold", image: null, diesAt: null } }),
      ],
      map_b: [row({ mapId: "map_b", q: 0, r: 0, resource: "diamonds" })],
    };
    const list = await officeMines("acc_me");
    expect(s.asked.sort()).toEqual(["map_a", "map_b"]);
    expect(list.map((m) => `${m.place}:${m.kind}:${m.q},${m.r}`)).toEqual([
      "Акания:diamonds:0,0",
      "Мир Альфа:wood:1,0",
      "Мир Альфа:stone:2,0",
    ]);
  });
  it("нет шахт — пусто, карты не спрашиваем", async () => {
    expect(await officeMines("acc_me")).toEqual([]);
    expect(s.asked).toEqual([]);
  });
});

describe("окно", () => {
  it("без здания — отказ", async () => {
    s.built = false;
    await expect((getMineOfficeMines as unknown as () => Promise<unknown>)()).rejects.toThrow(
      "mineoffice.not_built",
    );
  });
  it("со зданием — список и часы сервера", async () => {
    s.cells = [cell("map_a", 1, 0)];
    s.rows = { map_a: [row({ q: 1, r: 0 })] };
    const v = (await (getMineOfficeMines as unknown as () => Promise<{ mines: unknown[]; serverNow: number }>)());
    expect(v.mines).toHaveLength(1);
    expect(v.serverNow).toBeGreaterThan(0);
  });
});
