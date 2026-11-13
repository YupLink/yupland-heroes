// Клетка подбитого корабля (dynamite-08) занята: судну туда хода нет, посадки в обломок
// нет, новые суда (верфь, призыв, «Создать корабль») и выход портала её не берут.
// Шаг на свободное судно, что уже стояло рядом с обломком, — посадка, она остаётся.
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ sql: [] as string[], rows: [] as unknown[] }));
vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    db.sql.push(sql);
    return db.rows;
  },
}));
vi.mock("./owner", () => ({ raidOwner: async () => "acc_me" }));

import { BLASTED_CELL, blastedHereSql, sailRefusal } from "./ship-blasted";
import { loadStepFacts } from "./step-facts";
import { seatOnShip } from "./ship-crew";
import { movePlayerThroughPortal } from "./portal-ship";

beforeEach(() => {
  db.sql = [];
  db.rows = [];
});

describe("sailRefusal — куда судну нельзя", () => {
  it("клетка подбитого — никому, и большому тоже", () => {
    expect(sailRefusal({ ocean: false, blasted: true }, false)).toBe(BLASTED_CELL);
    expect(sailRefusal({ ocean: false, blasted: true }, true)).toBe(BLASTED_CELL);
    expect(BLASTED_CELL).toBe("braid.ship_blasted_cell");
  });

  it("прежнее правило океана — как было, и первым", () => {
    expect(sailRefusal({ ocean: true }, false)).toBe("braid.ship_too_small");
    expect(sailRefusal({ ocean: true, blasted: true }, false)).toBe("braid.ship_too_small");
    expect(sailRefusal({ ocean: true }, true)).toBeNull();
    expect(sailRefusal({ ocean: false, blasted: false }, false)).toBeNull();
  });
});

describe("признак «на клетке подбитый»", () => {
  it("только штамп blasted_at держит клетку, а не любое судно на ней", () => {
    const sql = blastedHereSql("c").replace(/\s+/g, " ");
    expect(sql).toBe(
      "EXISTS (SELECT 1 FROM yuplink.beta_raid_ship bw WHERE bw.map_id = c.map_id AND bw.q = c.q AND bw.r = c.r " +
        "AND bw.blasted_at IS NOT NULL AND bw.blasted_at > now() - interval '60 minutes')",
    );
  });

  it("факты шага несут его тем же признаком", async () => {
    db.rows = [{ terrain_id: "t", cost: 1, water: true, blasted: true }];
    expect((await loadStepFacts("m", 1, 2))?.blasted).toBe(true);
    expect(db.sql[0]).toContain(`${blastedHereSql("c")} AS blasted`);
    db.rows = [{ terrain_id: "t", cost: 1, water: true, blasted: null }];
    expect((await loadStepFacts("m", 1, 2))?.blasted).toBe(false);
  });

  it("в обломок не садятся, даже выбранный в окне", async () => {
    await seatOnShip("w.me", "map_1", 4, 4, false, "ship_w");
    expect(db.sql[0]).toContain("AND f.hp > 0 AND f.blasted_at IS NULL");
  });

  it("выход портала на клетке подбитого судну не годится — капитана высадит", async () => {
    await movePlayerThroughPortal(
      "w.me",
      "map_1",
      { q: 3, r: 3 },
      {
        exitWater: true,
        ship: { id: "ship_me", q: 1, r: 1, kind: "big" },
      },
    ).catch(() => null);
    const sail = db.sql.find((x) => x.includes("WITH sh AS")) ?? "";
    expect(sail).toContain(`AND NOT ${blastedHereSql("c")}`);
  });
});
