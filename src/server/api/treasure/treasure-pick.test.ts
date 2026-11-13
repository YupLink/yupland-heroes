// Где закопать клад: «доступ к ней обязательно должен быть» (владелец 07.11.2026).
import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/db/mcpClient", () => ({ mcpExec: vi.fn() }));

const { mainComponent, reachableCandidates } = await import("./treasure-pick");
const { mapFlagsSql, CHOPPABLE_IDS_SQL } = await import("./treasure-pick-sql");

const set = (...k: string[]) => new Set(k);

describe("доступ к клетке клада", () => {
  // Большой кусок: полоса (0..4, 0); остров: (10,10)-(11,10).
  const walk = set("0,0", "1,0", "2,0", "3,0", "4,0", "10,10", "11,10");

  it("самый большой связный кусок — полоса, не остров", () => {
    expect([...mainComponent(walk)].sort()).toEqual(["0,0", "1,0", "2,0", "3,0", "4,0"]);
  });

  it("в куске или вплотную к нему (дерево рубят с соседней) — да; остров и занятое — нет", () => {
    const got = reachableCandidates(
      walk,
      ["2,0", "2,1,d", "10,10", "11,10,d", "3,0", "7,7,d"],
      set("3,0"),
    );
    expect(got).toEqual([
      { q: 2, r: 0 },
      { q: 2, r: 1 },
    ]);
  });
});

describe("SQL флагов карты", () => {
  const sql = mapFlagsSql("rmap_x").replace(/\s+/g, " ");
  const chop = CHOPPABLE_IDS_SQL.replace(/\s+/g, " ");

  it("клад — на суше без построек и объектов, декор — только рубящийся", () => {
    expect(sql).toContain("c.object_id IS NULL");
    expect(sql).toContain("(c.building_id IS NOT NULL OR c.group_id IS NOT NULL) AS bld");
    expect(sql).toContain("NOT COALESCE(c.void_fog, false)");
    expect(sql).toContain("c.decoration_id IS NULL OR c.decoration_id IN (SELECT d.id");
  });

  it("рубится — как в окне рубки: включено, товар выдачи и инструмент есть в справочнике", () => {
    expect(chop).toContain("d.kind = 'decoration' AND COALESCE(d.active, true)");
    expect(chop).toContain("d.meta->'interact'->>'on' = 'true'");
    expect(chop).toContain("ci.id = d.meta->'interact'->>'itemId'");
    expect(chop).toContain("ti.id = d.meta->'interact'->>'toolItemId'");
  });

  it("проход — без декора-преграды и без того, что вырастет снова", () => {
    expect(sql).toMatch(/AS walk/);
    expect(sql).toContain("raid_decor_respawn d");
  });
});
