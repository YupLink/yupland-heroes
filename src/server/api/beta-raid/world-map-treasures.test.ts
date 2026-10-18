// Мои клады на карте мира: только закопанное мной (мешочки, обычные и
// магические сундуки) — с любого расстояния, в обоих режимах, мимо тумана.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { myMoundsSql } from "@/server/api/beta-raid/main-tool/dig-hole";
import { WORLD_MARK_KINDS } from "@/lib/raid/worldMapCodec";
import { packWorldMap } from "@/server/api/beta-raid/world-map-pack";
import { loadMyTreasures } from "@/server/api/beta-raid/world-map-treasures";

const db = vi.hoisted(() => ({
  sqls: [] as string[],
  rows: [] as unknown[],
  fail: false,
}));

vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    db.sqls.push(sql);
    if (db.fail) throw new Error("MCP timeout");
    return db.rows;
  },
}));

beforeEach(() => {
  db.sqls.length = 0;
  db.rows = [];
  db.fail = false;
});

describe("loadMyTreasures", () => {
  it("та же выборка, что «мои бугорки» на карте рейда, — только buried_by = я", async () => {
    db.rows = [
      { id: "lb_1", q: 4, r: -2, buried: true, leftMs: 1000 },
      { id: "cm_9_9", q: "9", r: "9", buried: true, leftMs: 1 },
    ];
    const cells = await loadMyTreasures("acc_me", "map_a");
    expect(cells).toEqual([
      { q: 4, r: -2 },
      { q: 9, r: 9 },
    ]);
    const sql = db.sqls[0];
    // Не копия: ровно myMoundsSql на карте игрока.
    expect(sql).toBe(myMoundsSql({ account: "acc_me", activeMapId: "map_a" }));
    // Мешочки, обычные и магические сундуки — каждый только моим аккаунтом.
    expect(sql).toContain("yuplink.raid_loot_bag b");
    expect(sql).toContain("yuplink.raid_plain_chest x");
    expect(sql).toContain("yuplink.raid_magic_chest x");
    expect(sql.match(/buried_by = 'acc_me'/g)).toHaveLength(3);
    expect(sql.match(/buried_by/g)).toHaveLength(3);
    // С любого расстояния: круга «второго обзора» нет.
    expect(sql).not.toContain("BETWEEN");
  });

  it("сбой чтения — пусто, карта не падает", async () => {
    db.fail = true;
    await expect(loadMyTreasures("acc_me", "map_a")).resolves.toEqual([]);
  });
});

// Остров 2×1: (0,0) и (1,0); (1,0) под куполом.
const CELLS = [
  { q: 0, r: 0, terrain_id: "grass" },
  { q: 1, r: 0, terrain_id: "grass", void_fog: true },
];
const TERRAINS = [{ id: "grass", name: "Трава", image_url: null }];
const T = WORLD_MARK_KINDS.indexOf("treasure");

describe("packWorldMap: клады", () => {
  const pack = (mode: "seen" | "all", seen: string | null) =>
    packWorldMap({
      mode,
      cells: CELLS,
      terrains: TERRAINS,
      marks: [{ kind: "mine", q: 1, r: 0, group: null }],
      // Под куполом, вне разведанного и рамки; дважды одна клетка; мусор.
      treasures: [
        { q: 1, r: 0 },
        { q: 30, r: -7 },
        { q: 30, r: -7 },
        { q: Number.NaN, r: 2 },
      ],
      seen,
    });

  it("«Разведанное»: клады мимо тумана и купола, постройки — только на показанном", () => {
    const w = pack("seen", "0,0,2");
    // Шахта под куполом пропала, оба клада на месте — по одному.
    expect(w.marks).toEqual([T, 1, 0, T, 30, -7]);
  });

  it("«Вся карта»: те же клады, шахта тоже видна", () => {
    expect(pack("all", null).marks).toEqual([0, 1, 0, T, 1, 0, T, 30, -7]);
  });

  it("ничего не разведано — клады всё равно в ответе", () => {
    const w = pack("seen", "");
    expect(w.cols * w.rows).toBe(0);
    expect(w.marks).toEqual([T, 1, 0, T, 30, -7]);
  });
});
