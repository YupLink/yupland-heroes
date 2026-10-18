// Портал с кораблём: водный выход, где уже стоит чужой борт.
//
// Корабль ставится и туда, где уже стоит корабль (владелец, 27.09). Раньше
// «сплавать» в такой выход портал не давал: капитана высаживало на берег, а
// его судно оставалось свободным у входа — на другом конце карты.
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({
  sql: [] as string[],
  sailMoved: 1,
  charged: [] as Array<[string, number]>,
  released: 0,
  crew: null as { id: string } | null,
}));

vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    if (sql.includes("WITH sh AS")) return [{ moved: s.sailMoved }];
    if (sql.includes("SELECT id FROM yuplink.beta_raid_ship")) return s.crew ? [s.crew] : [];
    if (sql.includes("INSERT INTO yuplink.beta_raid_positions")) return [{ account_id: "acc_me" }];
    return [];
  },
}));
vi.mock("./owner", () => ({ raidOwner: async () => "acc_me" }));
vi.mock("./ships", () => ({ freeWaterAround: async () => ({ q: 9, r: 9 }) }));
vi.mock("./ship-rescue", () => ({ nearestLand: async () => ({ q: 3, r: 4 }) }));
vi.mock("./ship-crew", () => ({
  chargeShipHp: async (id: string, n: number) => void s.charged.push([id, n]),
  releaseShip: async () => void s.released++,
  seatOnShip: async () => null,
}));

import { leaveShipBehind, movePlayerThroughPortal } from "./portal-ship";

const ctx = (kind: "small" | "big") => ({
  exitWater: true,
  ship: { id: "ship_me", q: 1, r: 1, kind },
});
const exit = { q: 3, r: 3 };
const sail = () => s.sql.find((x) => x.includes("WITH sh AS")) ?? "";

beforeEach(() => {
  s.sql = [];
  s.sailMoved = 1;
  s.charged = [];
  s.released = 0;
  s.crew = null;
});

describe("movePlayerThroughPortal — водный выход со своим судном", () => {
  it("чужой борт у выхода не мешает: плывём вместе, судно у входа не бросаем", async () => {
    const res = await movePlayerThroughPortal("w.near", "map_1", exit, ctx("small"));
    expect(res).toEqual({ moved: true, mode: "sailed" });
    expect(sail()).not.toContain("FROM yuplink.beta_raid_ship o");
    expect(s.released).toBe(0);
  });

  it("малому океан по-прежнему закрыт, большому — нет", async () => {
    await movePlayerThroughPortal("w.near", "map_1", exit, ctx("small"));
    expect(sail()).toContain("AND NOT (t.name ~* '(океан|ocean)')");
    s.sql = [];
    await movePlayerThroughPortal("w.near", "map_1", exit, ctx("big"));
    expect(sail()).not.toContain("AND NOT (t.name ~* '(океан|ocean)')");
  });

  it("выход судну не подошёл — капитан сходит на берег, борт отпущен у входа", async () => {
    s.sailMoved = 0;
    const res = await movePlayerThroughPortal("w.near", "map_1", exit, ctx("small"));
    expect(res).toEqual({ moved: true, mode: "left" });
    expect(s.released).toBe(1);
    expect(s.charged).toEqual([["ship_me", 50]]);
  });
});

describe("переход на другой этаж", () => {
  it("судно остаётся у входа: сход как высадка, борт отпущен", async () => {
    s.crew = { id: "ship_me" };
    expect(await leaveShipBehind("w.near")).toBe(true);
    expect(s.charged).toEqual([["ship_me", 50]]);
    expect(s.released).toBe(1);
  });

  it("пешему отпускать нечего", async () => {
    expect(await leaveShipBehind("w.near")).toBe(false);
    expect(s.released).toBe(0);
  });

  it("позиция пишется вместе с картой выхода", async () => {
    const res = await movePlayerThroughPortal("w.near", "map_b", exit, {
      ship: null,
      exitWater: false,
    });
    expect(res).toEqual({ moved: true, mode: "none" });
    const pos = s.sql.find((x) => x.includes("INSERT INTO yuplink.beta_raid_positions")) ?? "";
    expect(pos).toContain("map_id = EXCLUDED.map_id");
    expect(pos).toContain("VALUES ('acc_me', 3, 3, now(), 'map_b')");
  });
});

describe("карта позиции", () => {
  it("и на своём этаже позиция пишется с картой — пустой она не остаётся", async () => {
    await movePlayerThroughPortal("w.near", "map_1", exit, { ship: null, exitWater: false });
    const pos = s.sql.find((x) => x.includes("INSERT INTO yuplink.beta_raid_positions")) ?? "";
    expect(pos).toContain("VALUES ('acc_me', 3, 3, now(), 'map_1')");
    expect(pos).toContain("map_id = EXCLUDED.map_id");
  });

  it("плавание через портал тоже пишет карту", async () => {
    await movePlayerThroughPortal("w.near", "map_1", exit, ctx("small"));
    expect(sail()).toContain("now(), 'map_1' FROM sh");
  });
});
