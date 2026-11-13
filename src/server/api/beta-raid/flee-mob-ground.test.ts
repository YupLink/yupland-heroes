// Побег НЕ ограничен дорогой и жилой (владелец, 22.10.2026: «при бегстве боссы
// могут забегать на дорогу — тут проблем нету — генерация — не позволено»;
// «при беге могут туда зайти. пусть будут — их прогонят если надо»). Запрет
// mob-ground — только для генерации; здесь сторожим, что в побег он не попал.
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ calls: [] as string[] }));

vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    db.calls.push(sql);
    if (sql.includes("AS free")) {
      const { hexesWithin } = await import("./flee-rules");
      return hexesWithin({ q: 0, r: 0 }, 3).map((h) => ({
        q: h.q,
        r: h.r,
        free: true,
        pass: true,
        water: false,
        players: [[0, 0]],
      }));
    }
    return [{ m0: 1 }];
  },
}));
vi.mock("./flee-cells", () => ({
  loadFleeCells: async () => new Map([["1,0", [{ objectId: "boss:rbt_a", layer: 0 }]]]),
  noteFleeMoved: () => {},
}));
vi.mock("./map-change-hooks", () => ({ cellTruthPatches: async () => [] }));
vi.mock("./map-journal", () => ({ recordMapChange: async () => {} }));
vi.mock("./voidCells", () => ({ loadVoidCells: async () => new Set() }));
vi.mock("../../raidLive", () => ({ publishRaid: () => {} }));

const { fleeAroundStep } = await import("./flee-move");
const { CAN_STAND_DRY, CAN_PASS_DRY, LANDING, fleeGridSql } = await import("./flee-sql");

beforeEach(() => {
  db.calls = [];
  vi.spyOn(Math, "random").mockReturnValue(0);
});

describe("побег босса: дорога и жила ему не запрет", () => {
  it("босс отбегает, и ни разведка, ни запись не спрашивают жилу и дорогу", async () => {
    const moves = await fleeAroundStep("rmap_x", { q: 0, r: 0 });
    expect(moves).toHaveLength(1);
    for (const sql of db.calls) {
      expect(sql).not.toContain("raid_map_vein");
      expect(sql).not.toContain("road_id");
    }
  });

  it("правила посадки и прохода — без дороги и жилы", () => {
    for (const sql of [CAN_STAND_DRY, CAN_PASS_DRY, LANDING("rmap_x", { q: 1, r: 0 }, false)]) {
      expect(sql).not.toContain("raid_map_vein");
      expect(sql).not.toContain("road_id");
    }
    expect(fleeGridSql("rmap_x", [{ q: 0, r: 0 }])).not.toContain("raid_map_vein");
  });
});
