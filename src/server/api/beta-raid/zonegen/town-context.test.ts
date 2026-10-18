// Контекст вокруг зоны: дороги и вода в прямоугольнике, расширенном на 6 клеток.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mcpExec = vi.fn();
vi.mock("@/server/db/mcpClient", () => ({ mcpExec: (...a: unknown[]) => mcpExec(...a) }));

import { loadTownContext, padBox, TOWN_REACH, townContextSql } from "./town-context";

describe("townContextSql", () => {
  it("своя карта, прямоугольник, дорога или вода по id местности", () => {
    const sql = townContextSql("rmap_x", { q0: -1, q1: 4, r0: 2, r1: 9 }, ["t_lake", "t_sea"]);
    expect(sql).toContain("c.map_id = 'rmap_x'");
    expect(sql).toContain("c.q BETWEEN -1 AND 4 AND c.r BETWEEN 2 AND 9");
    expect(sql).toContain("c.terrain_id IN ('t_lake', 't_sea')");
    expect(sql).toContain("c.road_id IS NOT NULL OR");
  });

  it("воды в справочнике нет — условие выключено, а не «IN ()»", () => {
    const sql = townContextSql("m", { q0: 0, q1: 1, r0: 0, r1: 1 }, []);
    expect(sql).not.toContain("IN ()");
    expect(sql).toContain("(FALSE) AS water");
  });

  it("padBox расширяет на шаг во все стороны", () => {
    expect(padBox({ q0: 0, q1: 2, r0: 5, r1: 5 }, TOWN_REACH)).toEqual({
      q0: -6,
      q1: 8,
      r0: -1,
      r1: 11,
    });
  });
});

describe("loadTownContext", () => {
  beforeEach(() => mcpExec.mockReset());

  it("ищет на 6 клеток за краем выделения и понимает «t» от psql", async () => {
    mcpExec.mockResolvedValue([
      { q: -5, r: 0, road: true, water: false },
      { q: "3", r: "7", road: "f", water: "t" },
    ]);
    const ctx = await loadTownContext(
      "m",
      [
        { q: 0, r: 0 },
        { q: 2, r: 1 },
      ],
      {
        t_grass: "Луг",
        t_lake: "Вода озёрная",
      },
    );
    const sql = String(mcpExec.mock.calls[0][0]);
    expect(sql).toContain("c.q BETWEEN -6 AND 8 AND c.r BETWEEN -6 AND 7");
    expect(sql).toContain("'t_lake'");
    expect(sql).not.toContain("'t_grass'");
    expect([...ctx.mapRoads]).toEqual(["-5,0"]);
    expect([...ctx.water]).toEqual(["3,7"]);
  });

  it("пустое выделение — ни одного запроса", async () => {
    const ctx = await loadTownContext("m", [], {});
    expect(mcpExec).not.toHaveBeenCalled();
    expect(ctx.mapRoads.size + ctx.water.size).toBe(0);
  });
});
