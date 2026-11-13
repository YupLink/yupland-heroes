// Подсветка окна «Посадить дерево»: семь клеток (своя и шесть соседних) одним
// запросом с теми же признаками, что у посадки; вердикт по порядку сетки
// PLACE_DIRS; кучке можно, клетки нет на карте — красная; остров — отказ.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PLACE_DIRS } from "@/lib/plainChest";

const s = vi.hoisted(() => ({
  sql: [] as string[],
  rows: [] as Array<Record<string, unknown>>,
  mapId: "rmap_1",
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({ handler: (fn: () => unknown) => fn }),
}));
vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    return s.rows;
  },
}));
vi.mock("@/server/api/beta-raid/plain-chest/pchest-row", () => ({
  pchestActor: async () => ({ wallet: "w1.tg", mapId: s.mapId, account: "acc_1" }),
}));
vi.mock("@/server/api/beta-raid/encounter-where", () => ({
  playerCell: async () => ({ q: 10, r: 5 }),
}));

const { getTreePlantCells, treeCellsSql } = await import("./tree-plant-cells");
const cells = getTreePlantCells as unknown as () => Promise<
  Array<{ dq: number; dr: number; ok: boolean; reason: string | null }>
>;
const at = (dq: number, dr: number, f: Record<string, unknown> = {}) => ({
  q: 10 + dq,
  r: 5 + dr,
  ...f,
});

beforeEach(() => {
  s.sql.length = 0;
  s.rows = [];
  s.mapId = "rmap_1";
});

describe("подсветка посадки", () => {
  it("один запрос на семь клеток вокруг героя, признаки — как у посадки", () => {
    const sql = treeCellsSql({ mapId: "m", q: 10, r: 5, account: "acc_1" }).replace(/\s+/g, " ");
    expect(sql).toContain(
      "(c.q, c.r) IN ((10, 4), (11, 4), (9, 5), (10, 5), (11, 5), (9, 6), (10, 6))",
    );
    expect(sql).toContain("AS stand_chest");
    expect(sql).toContain("AS ground_bag");
    expect(sql).toContain("p.account_id <> 'acc_1'");
    expect(sql).toContain("lb.map_id = c.map_id AND lb.q = c.q AND lb.r = c.r");
  });

  it("вердикты по порядку сетки: кучка — зелёная, дорога/игрок — красные, клетки нет — занято", async () => {
    s.rows = [
      at(0, -1),
      at(1, -1, { chest: true, bag: true }), // бугорки сундука и мешочка
      at(-1, 0, { road: true }),
      at(0, 0),
      at(1, 0, { player: true }),
      at(-1, 1, { stand_chest: true }),
      // (0, 1) — клетки нет на карте
    ];
    const out = await cells();
    expect(out.map((c) => [c.dq, c.dr])).toEqual(PLACE_DIRS.map((d) => [d.dq, d.dr]));
    expect(out.map((c) => c.reason)).toEqual([
      null,
      null,
      "tree.road",
      null,
      "tree.player",
      "tree.busy",
      "tree.busy",
    ]);
    expect(out.map((c) => c.ok)).toEqual([true, true, false, true, false, false, false]);
    expect(s.sql).toHaveLength(1);
  });

  it("остров — отказ без запроса клеток", async () => {
    s.mapId = "isle_x";
    await expect(cells()).rejects.toThrow("tree.island");
    expect(s.sql).toHaveLength(0);
  });
});
