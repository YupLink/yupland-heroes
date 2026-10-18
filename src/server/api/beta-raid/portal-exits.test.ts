// Выходы портала по комнате (владелец, 07.10.2026): комната — номер на этаже
// назначения (пусто — на своём); выход ищется по всем ОТКРЫТЫМ картам, вход
// исключается только на своей карте; дверь выходов не имеет.
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({ sql: [] as string[], rows: [] as unknown[] }));

vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    return s.rows;
  },
}));

const { pickExit, portalExits, roomOf, ROOM_MAP_SQL } = await import("./portal-exits");
const { portalConfig } = await import("@/lib/portal");

beforeEach(() => {
  s.sql = [];
  s.rows = [];
});

describe("roomOf", () => {
  it("комната на своём этаже, если этаж не назначен", () => {
    expect(roomOf(portalConfig({ portal: { group: 4 } }), "map_a")).toEqual({
      mapId: "map_a",
      group: 4,
    });
  });
  it("комната на этаже назначения", () => {
    const cfg = portalConfig({ portal: { group: 2, targetMap: "map_b" } });
    expect(roomOf(cfg, "map_a")).toEqual({ mapId: "map_b", group: 2 });
  });
  it("у двери этажа нет — она всегда своя", () => {
    const cfg = portalConfig({ portal: { group: 0, targetMap: "map_b" } });
    expect(roomOf(cfg, "map_a")).toEqual({ mapId: "map_a", group: 0 });
  });
});

describe("portalExits", () => {
  it("дверь — без запроса и без выходов", async () => {
    expect(await portalExits({ mapId: "m", group: 0 }, { mapId: "m", q: 0, r: 0 })).toEqual([]);
    expect(s.sql).toHaveLength(0);
  });

  it("ищет комнату по всем открытым картам, исключая вход на его карте", async () => {
    s.rows = [{ map_id: "map_b", q: "3", r: "-4" }];
    const out = await portalExits({ mapId: "map_b", group: 7 }, { mapId: "map_a", q: 1, r: 2 });
    expect(out).toEqual([{ mapId: "map_b", q: 3, r: -4 }]);
    const sql = s.sql[0] ?? "";
    expect(sql).toContain("m.active");
    expect(sql).not.toMatch(/c\.map_id = 'map_b'\s+AND/);
    expect(sql).toContain(`${ROOM_MAP_SQL("c")} = 'map_b'`);
    expect(sql).toContain("'portal'->>'group') = '7'");
    expect(sql).toMatch(/NOT \(c\.map_id = 'map_a'\s+AND c\.q = 1 AND c\.r = 2\)/);
  });

  it("случайный выход; пусто — null", () => {
    expect(pickExit([])).toBeNull();
    const one = { mapId: "a", q: 1, r: 1 };
    expect(pickExit([one])).toBe(one);
  });
});
